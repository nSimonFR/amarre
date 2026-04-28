self:
{ config, lib, pkgs, ... }:
let
  cfg = config.services.amarre;
  serverPkg = self.packages.${pkgs.stdenv.hostPlatform.system}.server;
in {
  options.services.amarre = {
    enable = lib.mkEnableOption "amarre — WS harness for CLI coding agents";

    agent = lib.mkOption {
      type = lib.types.str;
      default = "pi";
      description = ''
        Which agent adapter to load at startup. Resolves to
        `agents/<name>/adapter.ts` inside the amarre source tree.

        Built-in adapters: `pi` (default), `claude-code`. The flake's
        server package brings both `pi` and `claude` onto PATH, so
        switching agents is a runtime concern only.
      '';
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8341;
      description = "TCP port the WebSocket server listens on (loopback only).";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Bind address. Keep on loopback; expose externally via Tailscale Serve.";
    };

    user = lib.mkOption {
      type = lib.types.str;
      description = ''
        User the server (and agent child process) runs as. Inherits the
        user's home-dir agent config (e.g. `~/.pi/agent/`).
      '';
    };

    package = lib.mkOption {
      type = lib.types.package;
      default = serverPkg;
      description = "The amarre server package.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.amarre = {
      description = "amarre — WS harness for CLI coding agents";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      stopIfChanged = true;
      environment = {
        AMARRE_AGENT = cfg.agent;
        AMARRE_PORT = toString cfg.port;
        AMARRE_HOST = cfg.host;
        HOME = "/home/${cfg.user}";
      };
      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = "users";
        WorkingDirectory = "/home/${cfg.user}";
        ExecStart = "${cfg.package}/bin/amarre-server";
        Restart = "on-failure";
        RestartSec = "5s";
      };
    };
  };
}
