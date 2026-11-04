import { describe, expect, it } from "vitest";
import {
  createInitialWorkflowAggregate,
  createProjectId,
  createTaskId,
  createWorkflowLimits,
  createWorkflowRunId,
  DomainError,
  reduceWorkflow,
  reduceWorkflowAll,
  WORKFLOW_EVENT_TYPES,
  WORKFLOW_RUN_STATUSES,
  type WorkflowAggregate,
  type WorkflowEvent,
  type WorkflowEventType,
  type WorkflowRunStatus,
} from "../src/index.js";

const NOW = "2026-11-05T00:00:00.000Z";

function expectDomainCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.fail(`expected DomainError code=${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    if (error instanceof DomainError) {
      expect(error.code).toBe(code);
    }
  }
}

function initial(limits = createWorkflowLimits()): WorkflowAggregate {
  return createInitialWorkflowAggregate({
    id: createWorkflowRunId("run_1"),
    taskId: createTaskId("task_1"),
    projectId: createProjectId("proj_1"),
    createdAt: NOW,
    limits,
  });
}

function happyPathTo(status: WorkflowRunStatus): WorkflowAggregate {
  const events: WorkflowEvent[] = [
    { type: "inspection_started", at: NOW },
    { type: "repository_inspected", at: NOW },
    { type: "planning_started", at: NOW },
    { type: "agent_execution_started", at: NOW, roleId: "planner" },
    { type: "agent_execution_completed", at: NOW, roleId: "planner" },
    { type: "plan_proposed", at: NOW },
    { type: "plan_approved", at: NOW, decidedBy: "human" },
    { type: "workspace_created", at: NOW },
    { type: "agent_execution_started", at: NOW, roleId: "implementer" },
    { type: "agent_execution_completed", at: NOW, roleId: "implementer" },
    { type: "gate_started", at: NOW, name: "unit" },
    { type: "gate_passed", at: NOW, name: "unit" },
    {
      type: "review_submitted",
      at: NOW,
      disposition: "approve",
      openFindingCount: 0,
    },
    { type: "gate_started", at: NOW, name: "final-unit" },
    { type: "gate_passed", at: NOW, name: "final-unit" },
    { type: "scope_check_passed", at: NOW },
    { type: "final_validation_passed", at: NOW },
    { type: "final_report_created", at: NOW },
  ];

  const stopBefore: Partial<Record<WorkflowRunStatus, number>> = {
    created: 0,
    inspecting: 1,
    planning: 2,
    awaiting_plan_approval: 6,
    preparing_workspace: 7,
    implementing: 8,
    validating: 10,
    reviewing: 12,
    final_validation: 13,
    awaiting_final_review: 17,
    completed: 18,
  };

  const count = stopBefore[status];
  if (count === undefined) {
    throw new Error(`happyPathTo does not support ${status}`);
  }
  return reduceWorkflowAll(initial(), events.slice(0, count));
}

describe("workflow reducer happy path", () => {
  it("reaches completed with required evidence", () => {
    const state = happyPathTo("completed");
    expect(state.run.status).toBe("completed");
    expect(state.evidence).toEqual({
      planApproved: true,
      gatesPassed: true,
      reviewApproved: true,
      scopeCheckPassed: true,
    });
    expect(state.activeWriterCount).toBe(0);
    expect(state.roleExecutionCounts.planner).toBe(1);
    expect(state.roleExecutionCounts.implementer).toBe(1);
  });

  it("rejects completed without scope evidence", () => {
    const state = happyPathTo("awaiting_final_review");
    const withoutScope: WorkflowAggregate = {
      run: state.run,
      limits: state.limits,
      roleExecutionCounts: state.roleExecutionCounts,
      activeWriterCount: state.activeWriterCount,
      evidence: {
        planApproved: true,
        gatesPassed: true,
        reviewApproved: true,
        scopeCheckPassed: false,
      },
      openFindingCount: state.openFindingCount,
      pendingGateNames: state.pendingGateNames,
    };
    expectDomainCode(
      () => reduceWorkflow(withoutScope, { type: "final_report_created", at: NOW }),
      "completion_evidence_missing",
    );
  });
});

describe("workflow reducer limits", () => {
  it("enforces max fix cycles", () => {
    let state = happyPathTo("reviewing");
    state = reduceWorkflow(state, {
      type: "review_submitted",
      at: NOW,
      disposition: "request_changes",
      openFindingCount: 2,
    });
    state = reduceWorkflow(state, { type: "fix_cycle_started", at: NOW });
    expect(state.run.status).toBe("fixing");
    expect(state.run.fixCycleCount).toBe(1);

    state = reduceWorkflow(state, {
      type: "agent_execution_started",
      at: NOW,
      roleId: "implementer",
    });
    state = reduceWorkflow(state, {
      type: "agent_execution_completed",
      at: NOW,
      roleId: "implementer",
    });
    state = reduceWorkflow(state, { type: "gate_started", at: NOW, name: "unit" });
    state = reduceWorkflow(state, { type: "gate_passed", at: NOW, name: "unit" });
    state = reduceWorkflow(state, {
      type: "review_submitted",
      at: NOW,
      disposition: "request_changes",
      openFindingCount: 1,
    });
    state = reduceWorkflow(state, { type: "fix_cycle_started", at: NOW });
    expect(state.run.fixCycleCount).toBe(2);

    state = reduceWorkflow(state, {
      type: "agent_execution_started",
      at: NOW,
      roleId: "implementer",
    });
    state = reduceWorkflow(state, {
      type: "agent_execution_completed",
      at: NOW,
      roleId: "implementer",
    });
    state = reduceWorkflow(state, { type: "gate_started", at: NOW, name: "unit" });
    state = reduceWorkflow(state, { type: "gate_passed", at: NOW, name: "unit" });
    state = reduceWorkflow(state, {
      type: "review_submitted",
      at: NOW,
      disposition: "request_changes",
      openFindingCount: 1,
    });
    expectDomainCode(
      () => reduceWorkflow(state, { type: "fix_cycle_started", at: NOW }),
      "fix_cycle_limit_exceeded",
    );
  });

  it("enforces max role executions and one active writer", () => {
    const limits = createWorkflowLimits({
      maxRoleExecutions: { planner: 1, implementer: 1, reviewer: 1 },
      maxParallelWriters: 1,
    });
    const state = reduceWorkflowAll(initial(limits), [
      { type: "inspection_started", at: NOW },
      { type: "repository_inspected", at: NOW },
      { type: "agent_execution_started", at: NOW, roleId: "planner" },
      { type: "plan_proposed", at: NOW },
      { type: "plan_approved", at: NOW, decidedBy: "human" },
      { type: "workspace_created", at: NOW },
      { type: "agent_execution_started", at: NOW, roleId: "implementer" },
    ]);
    expect(state.activeWriterCount).toBe(1);
    expectDomainCode(
      () =>
        reduceWorkflow(state, {
          type: "agent_execution_started",
          at: NOW,
          roleId: "implementer",
        }),
      "role_execution_limit_exceeded",
    );
  });

  it("rejects a second planner start when maxRoleExecutions.planner is 1", () => {
    const limits = createWorkflowLimits({
      maxRoleExecutions: { planner: 1, implementer: 5, reviewer: 5 },
    });
    const state = reduceWorkflowAll(initial(limits), [
      { type: "inspection_started", at: NOW },
      { type: "repository_inspected", at: NOW },
      { type: "agent_execution_started", at: NOW, roleId: "planner" },
    ]);
    expectDomainCode(
      () =>
        reduceWorkflow(state, {
          type: "agent_execution_started",
          at: NOW,
          roleId: "planner",
        }),
      "role_execution_limit_exceeded",
    );
  });

  it("rejects a second concurrent implementer writer", () => {
    const limits = createWorkflowLimits({
      maxRoleExecutions: { planner: 3, implementer: 5, reviewer: 5 },
      maxParallelWriters: 1,
    });
    const state = reduceWorkflowAll(initial(limits), [
      { type: "inspection_started", at: NOW },
      { type: "repository_inspected", at: NOW },
      { type: "plan_proposed", at: NOW },
      { type: "plan_approved", at: NOW, decidedBy: "human" },
      { type: "workspace_created", at: NOW },
      { type: "agent_execution_started", at: NOW, roleId: "implementer" },
    ]);
    expectDomainCode(
      () =>
        reduceWorkflow(state, {
          type: "agent_execution_started",
          at: NOW,
          roleId: "implementer",
        }),
      "active_writer_limit_exceeded",
    );
  });
});

describe("workflow reducer terminals", () => {
  it("rejects transitions out of terminal statuses", () => {
    const terminals: WorkflowRunStatus[] = [
      "completed",
      "failed",
      "cancelled",
      "blocked",
      "interrupted",
    ];
    for (const status of terminals) {
      const base = happyPathTo("awaiting_plan_approval");
      const terminal =
        status === "blocked"
          ? reduceWorkflow(base, {
              type: "plan_rejected",
              at: NOW,
              decidedBy: "human",
            })
          : status === "cancelled"
            ? reduceWorkflow(base, { type: "run_cancelled", at: NOW })
            : status === "interrupted"
              ? reduceWorkflow(base, { type: "run_interrupted", at: NOW })
              : status === "failed"
                ? reduceWorkflow(happyPathTo("implementing"), {
                    type: "agent_execution_failed",
                    at: NOW,
                    roleId: "implementer",
                  })
                : happyPathTo("completed");

      expect(terminal.run.status).toBe(status);
      expectDomainCode(
        () => reduceWorkflow(terminal, { type: "inspection_started", at: NOW }),
        "terminal_transition_rejected",
      );
      expectDomainCode(
        () => reduceWorkflow(terminal, { type: "run_cancelled", at: NOW }),
        "terminal_transition_rejected",
      );
    }
  });

  it("maps policy and budget events to blocked", () => {
    const state = happyPathTo("implementing");
    expect(
      reduceWorkflow(state, { type: "policy_violation_detected", at: NOW, reason: "sandbox" }).run
        .status,
    ).toBe("blocked");
    expect(reduceWorkflow(state, { type: "budget_threshold_reached", at: NOW }).run.status).toBe(
      "blocked",
    );
  });
});

describe("workflow reducer invalid transitions", () => {
  it("rejects plan_approved outside awaiting_plan_approval", () => {
    expectDomainCode(
      () =>
        reduceWorkflow(happyPathTo("planning"), {
          type: "plan_approved",
          at: NOW,
          decidedBy: "human",
        }),
      "invalid_transition",
    );
  });

  it("rejects workspace_created before plan approval", () => {
    expectDomainCode(
      () => reduceWorkflow(happyPathTo("planning"), { type: "workspace_created", at: NOW }),
      "invalid_transition",
    );
  });

  it("rejects unknown gate_passed", () => {
    expectDomainCode(
      () =>
        reduceWorkflow(happyPathTo("validating"), {
          type: "gate_passed",
          at: NOW,
          name: "missing",
        }),
      "unknown_gate",
    );
  });
});

describe("workflow transition table exhaustiveness", () => {
  const probeEvent = (type: WorkflowEventType): WorkflowEvent => {
    switch (type) {
      case "inspection_started":
      case "repository_inspected":
      case "planning_started":
      case "plan_proposed":
      case "workspace_created":
      case "fix_cycle_started":
      case "budget_threshold_reached":
      case "final_validation_started":
      case "final_validation_passed":
      case "scope_check_passed":
      case "final_report_created":
      case "run_cancelled":
      case "run_interrupted":
      case "finding_accepted":
      case "finding_dismissed":
        return { type, at: NOW };
      case "plan_approved":
      case "plan_rejected":
        return { type, at: NOW, decidedBy: "human" };
      case "agent_execution_started":
      case "agent_execution_completed":
      case "agent_execution_failed":
        return { type, at: NOW, roleId: "implementer" };
      case "gate_started":
      case "gate_passed":
      case "gate_failed":
        return { type, at: NOW, name: "unit" };
      case "review_submitted":
        return {
          type,
          at: NOW,
          disposition: "approve",
          openFindingCount: 0,
        };
      case "policy_violation_detected":
        return { type, at: NOW, reason: "deny" };
      default: {
        const exhaustive: never = type;
        return exhaustive;
      }
    }
  };

  it("covers every status × event with accept or DomainError", () => {
    const fixtures: Partial<Record<WorkflowRunStatus, WorkflowAggregate>> = {
      created: happyPathTo("created"),
      inspecting: happyPathTo("inspecting"),
      planning: happyPathTo("planning"),
      awaiting_plan_approval: happyPathTo("awaiting_plan_approval"),
      preparing_workspace: happyPathTo("preparing_workspace"),
      implementing: happyPathTo("implementing"),
      validating: happyPathTo("validating"),
      reviewing: happyPathTo("reviewing"),
      fixing: reduceWorkflow(happyPathTo("reviewing"), {
        type: "fix_cycle_started",
        at: NOW,
      }),
      final_validation: happyPathTo("final_validation"),
      awaiting_final_review: happyPathTo("awaiting_final_review"),
      completed: happyPathTo("completed"),
      failed: reduceWorkflow(happyPathTo("implementing"), {
        type: "agent_execution_failed",
        at: NOW,
        roleId: "implementer",
      }),
      cancelled: reduceWorkflow(happyPathTo("planning"), {
        type: "run_cancelled",
        at: NOW,
      }),
      blocked: reduceWorkflow(happyPathTo("awaiting_plan_approval"), {
        type: "plan_rejected",
        at: NOW,
        decidedBy: "human",
      }),
      interrupted: reduceWorkflow(happyPathTo("planning"), {
        type: "run_interrupted",
        at: NOW,
      }),
    };

    for (const status of WORKFLOW_RUN_STATUSES) {
      const fixture = fixtures[status];
      expect(fixture, `missing fixture for ${status}`).toBeDefined();
      if (fixture === undefined) {
        continue;
      }
      expect(fixture.run.status).toBe(status);

      for (const eventType of WORKFLOW_EVENT_TYPES) {
        const event = probeEvent(eventType);
        try {
          const next = reduceWorkflow(fixture, event);
          expect(typeof next.run.status).toBe("string");
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
        }
      }
    }
  });
});
