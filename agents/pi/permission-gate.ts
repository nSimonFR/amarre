// Loaded by pi-mobile via `pi -e <this>`. On every tool_call, asks the
// connected client to confirm via ctx.ui.confirm — which in RPC mode
// becomes an extension_ui_request the client answers with extension_ui_response.

export default function (pi: any) {
  pi.on("tool_call", async (event: any, ctx: any) => {
    const summary = JSON.stringify(event.input ?? {}).slice(0, 400);
    const ok = await ctx.ui.confirm(`Run ${event.toolName}?`, summary);
    if (!ok) return { block: true, reason: "denied by remote user" };
  });
}
