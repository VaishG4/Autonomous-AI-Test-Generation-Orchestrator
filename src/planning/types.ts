export type TestPlanEntry = {
  prod: string;       // repo-relative
  test: string;       // repo-relative (must be under /test)
};

export type TestPlan = {
  generatedAt: string;
  entries: TestPlanEntry[];
};
