{
  description = "pi-mobile — remote-session WS bridge for pi-coding-agent";

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
          pkgs = nixpkgs.legacyPackages.${system};
          pi = llm-agents.packages.${system}.pi;
          bridge = pkgs.writeShellApplication {
            name = "pi-mobile-bridge";
            runtimeInputs = [ pkgs.bun pi ];
            text = ''
              export PI_BIN="''${PI_BIN:-${pi}/bin/pi}"
              export PI_MOBILE_GATE="''${PI_MOBILE_GATE:-${./bridge/permission-gate.ts}}"
              exec bun run ${./bridge/bridge.ts} "$@"
            '';
          };
        in {
          inherit bridge;
          default = bridge;
        });

      nixosModules.pi-mobile = import ./module.nix self;
      nixosModules.default = self.nixosModules.pi-mobile;

      checks = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in {
          tests = pkgs.runCommand "pi-mobile-tests" {
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
