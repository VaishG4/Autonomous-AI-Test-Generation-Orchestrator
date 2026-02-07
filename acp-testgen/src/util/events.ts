// Event logging is disabled. This no-op preserves the module so other imports
// won't fail if left in the codebase.
export function appendEventJsonl(_repoRootAbs: string, _obj: any) {
  // intentionally no-op
}

export default appendEventJsonl;
