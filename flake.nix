{
  description = "amarre — tailnet-only WebSocket harness for CLI coding agents (pi, claude-code, …)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    llm-agents.url = "github:numtide/llm-agents.nix";
    llm-agents.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, llm-agents }:
    let
      systems = [ "aarch64-linux" "x86_64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system);
    in {
      packages = forAllSystems (system:
        let
          # Narrow allowUnfree to claude-code only — needed for the
          # claude-code adapter; doesn't widen the rest of the closure.
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfreePredicate = pkg:
              builtins.elem (nixpkgs.lib.getName pkg) [ "claude-code" ];
          };
          pi = llm-agents.packages.${system}.pi;
          claudeCode = pkgs.claude-code;
          src = ./.;
          server = pkgs.writeShellApplication {
            name = "amarre-server";
            runtimeInputs = [ pkgs.bun pi claudeCode ];
            text = ''
              export PI_BIN="''${PI_BIN:-${pi}/bin/pi}"
              export CLAUDE_BIN="''${CLAUDE_BIN:-${claudeCode}/bin/claude}"
              export AMARRE_AGENT="''${AMARRE_AGENT:-pi}"
              exec bun run ${src}/server/server.ts "$@"
            '';
          };
        in {
          inherit server;
          default = server;
        });

      nixosModules.amarre = import ./module.nix self;
      nixosModules.default = self.nixosModules.amarre;

      checks = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in {
          tests = pkgs.runCommand "amarre-tests" {
            buildInputs = [ pkgs.bun pkgs.bash pkgs.coreutils ];
          } ''
            cp -r ${./.} src
            chmod -R +w src
            cd src
            export HOME=$TMPDIR
            bun install --no-progress --offline 2>/dev/null || bun install --no-progress
            bun test
            touch $out
          '';
        });
    };
}
