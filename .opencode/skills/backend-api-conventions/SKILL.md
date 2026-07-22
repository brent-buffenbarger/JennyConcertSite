---
name: backend-api-conventions
description: Use when working on the Python, FastAPI, or Uvicorn backend in this repository, especially for API design, request/response models, validation, tests, service layers, and robust data update flows.
---

# Backend API Conventions

Use this skill for backend development in this repository.

## Primary Stack

- Python
- FastAPI
- Uvicorn

## Quality Bar

- Prefer clear, robust code over clever code.
- Build APIs that are easy to test, reason about, and extend.
- Keep boundaries explicit between routing, validation, business logic, and data access.
- Include sufficient tests for behavior, edge cases, and failure paths.

## Code Expectations

- Use type hints consistently.
- Favor straightforward functions and modules over unnecessary abstraction.
- Add concise comments only where logic or safety constraints are not obvious.
- Validate inputs and fail with informative errors.
- Keep mutation paths deliberate and easy to audit.

## FastAPI Guidance

- Use explicit request and response models.
- Keep route handlers thin.
- Move real logic into service or domain functions.
- Make response shapes stable and predictable.
- Treat validation and error handling as first-class behavior.

## Data and Update Flow Guidance

- Read and write paths should be easy to trace.
- Prefer deterministic transformations.
- Preserve source fidelity where downstream parsing may evolve.
- When updating structured content, keep rollback or restore paths in mind.
- Avoid hidden side effects.

## Testing Guidance

- Add unit tests for pure transformation logic.
- Add API tests for endpoint behavior.
- Cover invalid input and expected failure modes.
- Keep tests readable and specific.
- Do not rely on fragile implicit state when explicit fixtures or setup are clearer.

## Architecture Heuristic

When implementing backend features:

1. define the API contract
2. define the data shape and validation model
3. implement pure transformation logic
4. wire the service layer
5. keep the route thin
6. test unit behavior and API behavior

## Good Output

- high-signal API modules
- clear schemas and validation
- reliable update behavior
- tests that prove the system works rather than only touching happy paths
