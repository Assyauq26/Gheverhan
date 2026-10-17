module.exports = function(source) {
 const before = '      ? 0 === (executionContext & 2) && prepareFreshStack(root, 0)';
 const after = '      ? (0 === (executionContext & 2) ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes))';
 if(source.split(before).length!==2) throw new Error('React ping patch does not match the pinned runtime exactly');
 return source.replace(before,after);
};
