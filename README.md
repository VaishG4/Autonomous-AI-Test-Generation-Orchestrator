# Autonomous AI Test Generation Orchestrator

This repository contains an orchestrator assistant for automated test generation and
coverage-driven test improvement using a Copilot/ACP agent. It coordinates
planning, non-destructive test scaffolding, test generation, and iterative
coverage analysis. Currently this assistant targets Python projects; support for other languages is planned.
---

## High level Project layout

- `acp-testgen/` — TypeScript orchestrator and ACP client integration.
  - `src/runPhase2.ts`, `src/runPhase4.ts`, `src/runPhase5.ts` — entrypoints for
    different phases (Phase 5 sends prompts + optional local coverage runs).
  - `src/coverage/coverageRunner.ts` — runs pytest/coverage and emits
    `tests/coverage.json` and a reduced `tests/coverage_summary.json`.
  - `src/planning/` — test plan builder.
  - `src/phases/` — scaffolding and generation helpers.
  - `package.json` — npm scripts (`phase2`, `phase4`, `phase5`).

- `src/` — the orchestrator (additional utilities and orchestration code).

Refer to the repository tree for full structure.

---

## Prerequisites

- Node.js (recommended via conda in the project examples)
- `tsx` for running TypeScript entrypoints (already listed in `acp-testgen/devDependencies`)
- Python environment with `pytest` and `coverage` (the examples use a conda env named `tc_gen_app`)

Example: create the conda environment from the provided `environment.yml` and activate it:

```bash
conda env create -f environment.yml
conda activate tc_gen_app
```

---



## Phases (in order)

The orchestrator is organized into numbered phases. High-level purpose of each:

- **Phase 2 — Repository context & metadata**: collect repository metadata
  (files, package/pyproject hints, read roots) and prepare the environment for
  later phases. Implemented in `acp-testgen/src/runPhase2.ts` and
  `src/phases/phase2RepoContext.ts`.
- **Phase 3 — Test scaffolding (non-destructive)**: create minimal test
  scaffolds for modules that lack tests. This is intentionally non-destructive
  (it will not overwrite existing tests). See
  `acp-testgen/src/phases/phase3CreateTestFiles.ts` and
  `src/phases/phase3_initTests.ts`.
- **Phase 4 — Test generation**: invoke generation logic (ACP-assisted)
  to produce candidate tests for scaffolded or existing test files. The test
  writer loop and generator live in `acp-testgen/src/runPhase4.ts`,
  `acp-testgen/src/phases/phase4GenerateTests.ts`, and
  `acp-testgen/src/phases/phase4TestWriterLoop.ts`.
- **Phase 5 — Coverage-driven fixer / prompt flow**: the iterative fixer that
  identifies missing coverage for a target file, prompts the ACP agent to
  propose test edits, applies them (within `tests/`), runs tests (optionally
  locally), and repeats until coverage targets are met. This flow is driven by
  `acp-testgen/src/runPhase5.ts` and the coverage runner at
  `acp-testgen/src/coverage/coverageRunner.ts`. Use `--no-tests` for prompt‑only
  mode or `--auto-run-tests` to run pytest locally and supply summaries to the
  agent.

These phases are modular: you can run scaffolding without generation, or run
the coverage-driven fixer against an existing test file. The orchestrator is
designed to keep writes limited to `tests/` and to let operators control when
pytest is actually executed.

## Quickstart

This orchestrator has three main scripts available in `acp-testgen`:

- `npm --prefix acp-testgen run phase2`
- `npm --prefix acp-testgen run phase4`
- `npm --prefix acp-testgen run phase5`

Example for running Phase 5 inside the conda environmet:

```bash
npm --prefix acp-testgen run phase5 -- --repo /path/to/repo --prodRel src/click/parser.py --no-tests
```

Behavior notes:
- `--no-tests` instructs the orchestrator to *not* run pytest/coverage and to
  tell the agent to provide test edits without executing tests here.
- `--auto-run-tests` (local-only): when passed, the orchestrator will run
  pytest/coverage locally (no UI approval required) and send a concise
  coverage summary to the agent.

If you run `phase5` locally with `--auto-run-tests`, the orchestrator will:
1. Start the ACP client and send the initial prompt.
2. Run `python -m coverage run -m pytest` and `python -m coverage json -o tests/coverage.json`.
3. Emit a reduced `tests/coverage_summary.json` and append a history line.
4. Send a short summary (percent covered and missing lines) to the agent.

Run with auto-run-tests:

```bash
conda run -n tc_gen_app npm --prefix acp-testgen run phase5 -- --repo /path/to/repo --prodRel src/click/parser.py --auto-run-tests
```

Or set the env instead of the flag:

```bash
ACPT_AUTO_RUN_TESTS=1 conda run -n tc_gen_app npm --prefix acp-testgen run phase5 -- --repo /path/to/repo --prodRel src/click/parser.py
```

If your environment blocks mediated tool calls (no UI to approve), prefer
running with `--auto-run-tests` locally or generate `tests/coverage.json` manually and re-run.

---

## Supplying coverage JSON yourself

If you prefer to run coverage by hand and then tell the agent the results,
generate `tests/coverage.json` and re-run the orchestrator to include those
results in the prompt. Example to produce JSON via pytest-cov:

```bash
# produce coverage.json (pytest-cov)
conda run -n tc_gen_app pytest --cov --cov-config=.coveragerc --cov-report=json:tests/coverage.json

# then run the orchestrator (prompt will read coverage summary if present)
conda run -n tc_gen_app npm --prefix acp-testgen run phase5 -- --repo /path/to/repo --prodRel src/click/parser.py
```

The orchestrator will detect `tests/coverage.json` and include a reduced
summary in the prompt so the agent can act without requesting a pytest run.

---

## File write policy and safety

The orchestrator enforces a write policy so that automated agents are only
allowed to write to `tests/` to avoid accidental modification of production
code. See `acp-testgen/src/policy/fsPolicy.ts` for enforcement details.

Always run the orchestrator on a machine/repo you control when enabling
`--auto-run-tests` because it spawns subprocesses and runs tests locally.

---

## Developer notes

- To change messaging/behavior, edit the `acp-testgen/src/runPhase5.ts` file.
- Coverage logic is in `acp-testgen/src/coverage/coverageRunner.ts`.
- The ACP client is implemented in `acp-testgen/src/acp/copilotAcpClient.*`.

If you want a fully automated loop (apply agent edits, rerun tests, re-prompt
until coverage reaches a target), I can add a `--max-iterations` option and
an iterative loop. The current `--auto-run-tests` runs coverage once and sends
the summary; further automation is available on request.

---

## Troubleshooting

- If the orchestrator emits "The user rejected this tool call" events, your
  environment is configured to mediate subprocess execution; run locally with
  `--auto-run-tests` or generate `tests/coverage.json` manually and re-run.
- If pytest or coverage are missing, install them into the active Python
  environment.

---

## Contributing

Open a PR or issue. Keep changes minimal and preserve `FsPolicy` protections
unless you intentionally extend allowed write paths.

---

## License

Project contains a mix of code; follow the repository's license (add or update
LICENSE as needed).
