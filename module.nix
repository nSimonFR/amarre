self:
{ config, lib, pkgs, ... }:
let
  cfg = config.services.pi-mobile;
  bridgePkg = self.packages.${pkgs.stdenv.hostPlatform.system}.bridge;
in {
  options.services.pi-mobile = {
    enable = lib.mkEnableOption "pi-coding-agent remote control bridge";

    port = lib.mkOption {
      type = lib.types.port;
      default = 8341;
      description = "TCP port the WebSocket bridge listens on (loopback only).";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Bind address. Keep on loopback; expose externally via Tailscale Serve.";
    };

    user = lib.mkOption {
      type = lib.types.str;
      description = ''
        User the bridge (and pi child process) runs as. Inherits the user's
        ~/.pi/agent/{settings.json,models.json,extensions/*} config.
      '';
    };

    package = lib.mkOption {
      type = lib.types.package;
      default = bridgePkg;
      description = "The pi-mobile bridge package.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.pi-mobile = {
      description = "pi-coding-agent remote control bridge";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      stopIfChanged = true;
      environment = {
        PI_MOBILE_PORT = toString cfg.port;
        PI_MOBILE_HOST = cfg.host;
        HOME = "/home/${cfg.user}";
      };
      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = "users";
        WorkingDirectory = "/home/${cfg.user}";
        ExecStart = "${cfg.package}/bin/pi-mobile-bridge";
        Restart = "on-failure";
        RestartSec = "5s";
      };
    };
  };
}
