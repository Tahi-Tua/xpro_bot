// This file exports helper functions from index.js for use in command files
// The functions are defined in index.js and will be populated at runtime

let addWarning, getWarnings, clearWarnings, enforceWarning;

// Initialize functions from index.js
function initHelpers(funcs) {
  addWarning = funcs.addWarning;
  getWarnings = funcs.getWarnings;
  clearWarnings = funcs.clearWarnings;
  enforceWarning = funcs.enforceWarning;
}

module.exports = {
  initHelpers,
  get addWarning() { return addWarning; },
  get getWarnings() { return getWarnings; },
  get clearWarnings() { return clearWarnings; },
  get enforceWarning() { return enforceWarning; }
};
