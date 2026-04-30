self:
{ config, lib, pkgs, ... }:
let
  cfg = config.services.amarre;
  serverPkg = self.packages.${pkgs.stdenv.hostPlatform.system}.server;

  # Synthesize a single `default` instance from the legacy `agent` option when
  # no `instances` are configured. Lets old NixOS configs keep working.
  effectiveInstances =
    if cfg.instances == { }
    then { default = { agent = cfg.agent; env = { }; }; }
    else cfg.instances;

  instancesJson = builtins.toJSON (lib.mapAttrsToList
    (id: i: { inherit id; agent = i.agent; env = i.env; })
    effectiveInstances);
in {
  options.services.amarre = {
    enable = lib.mkEnableOption "amarre — WS harness for CLI coding agents";

    agent = lib.mkOption {
      type = lib.types.str;
      default = "pi";
      description = ''
        Legacy single-instance shortcut. Used only when `instances` is empty.
        Resolves to `agents/<name>/adapter.ts` inside the amarre source tree.

        Built-in adapters: `pi` (default), `claude-code`. The flake's server
        package brings both `pi` and `claude` onto PATH.

        For multi-instance setups (e.g. a `claude_personal` and `claude_work`
        running side-by-side with separate `CLAUDE_HOME` env), use
        `services.amarre.instances` instead and leave `agent` at its default.
      '';
    };

    instances = lib.mkOption {
      type = lib.types.attrsOf (lib.types.submodule {
        options = {
          agent = lib.mkOption {
            type = lib.types.str;
            description = ''
              Adapter name for this instance (e.g. `pi`, `claude-code`).
              Resolves to `agents/<name>/adapter.ts` inside the amarre source
              tree.
            '';
          };
          env = lib.mkOption {
            type = lib.types.attrsOf lib.types.str;
            default = { };
            description = ''
              Environment variables injected at spawn time for sessions on
              this instance. Merged before the per-session `env` field on
              `POST /sessions` (session env wins on conflict).

              Useful for per-profile isolation, e.g. `{ CLAUDE_HOME =
              "/home/me/.claude_work"; }` to run a parallel Claude Code
              workspace without touching the user's main profile.
            '';
          };
        };
      });
      default = { };
      example = lib.literalExpression ''
        {
          personal = {
            agent = "claude-code";
            env = { CLAUDE_HOME = "/home/me/.claude_personal"; };
          };
          work = {
            agent = "claude-code";
            env = {
              CLAUDE_HOME = "/home/me/.claude_work";
              AMARRE_CLAUDE_MODEL = "claude-opus-4-7";
            };
          };
          pi = { agent = "pi"; };
        }
      '';
      description = ''
        Named adapter instances exposed by this server. When non-empty, the
        legacy `agent` option is ignored and `POST /sessions` accepts an
        `instanceId` body field selecting which instance handles the session.
        See `docs/PROTOCOL.md` §4.1.

        When empty, a single instance named `default` is synthesized from the
        legacy `agent` option (backward-compatible behaviour).
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

    maxSessions = lib.mkOption {
      type = lib.types.ints.positive;
      default = 8;
      description = ''
        Maximum number of concurrent agent sessions across all instances.
        POST /sessions returns 429 when the cap is reached.
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
        AMARRE_INSTANCES_JSON = instancesJson;
        AMARRE_PORT = toString cfg.port;
        AMARRE_HOST = cfg.host;
        AMARRE_MAX_SESSIONS = toString cfg.maxSessions;
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
