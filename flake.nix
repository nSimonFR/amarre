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

          # Build a directory containing the amarre source + populated
          # node_modules + bundled SDK broker. The broker is bundled with
          # `bun build` so it carries its npm deps inline; the rest of the
          # source still references node_modules from the source tree, but the
          # only runtime npm consumer (the SDK broker) no longer needs it.
          # This derivation is impure — it pulls deps from the npm registry —
          # so consumers need `--impure` or a pre-populated bun cache.
          amarreSrc = pkgs.stdenv.mkDerivation {
            pname = "amarre-src";
            version = "0.3.0";
            src = ./.;
            nativeBuildInputs = [ pkgs.bun pkgs.cacert ];
            __noChroot = true;
            dontConfigure = true;
            buildPhase = ''
              export HOME=$TMPDIR
              bun install --no-progress --frozen-lockfile
              # Self-contained broker: includes @anthropic-ai/claude-agent-sdk
              # so the spawned bun process at runtime needs no node_modules
              # lookup against the read-only store.
              bun build agents/claude-code/broker.ts \
                --target=bun \
                --outdir agents/claude-code/dist
            '';
            installPhase = ''
              mkdir -p $out
              cp -r . $out/
            '';
            dontFixup = true;
          };

          server = pkgs.writeShellApplication {
            name = "amarre-server";
            runtimeInputs = [ pkgs.bun pi claudeCode ];
            text = ''
              export PI_BIN="''${PI_BIN:-${pi}/bin/pi}"
              export CLAUDE_BIN="''${CLAUDE_BIN:-${claudeCode}/bin/claude}"
              export AMARRE_AGENT="''${AMARRE_AGENT:-pi}"
              # Adapter looks for the bundled broker first; fall back to the
              # .ts source if missing (dev mode).
              if [ -f "${amarreSrc}/agents/claude-code/dist/broker.js" ]; then
                export AMARRE_CLAUDE_BROKER="${amarreSrc}/agents/claude-code/dist/broker.js"
              fi
              exec bun run ${amarreSrc}/server/server.ts "$@"
            '';
          };
        in {
          inherit server amarreSrc;
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
