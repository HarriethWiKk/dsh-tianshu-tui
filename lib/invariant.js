//#region lib/types/invariant.js
const PACKAGE_NAME = "@deepseek-ai/dsh-tianshu-tui";
/** Cordis companion plugin name. */
const name = "tui-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the render core only consumes streams owned by other
* packages; its UI state is process-local and behaviorally tested.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
