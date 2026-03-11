{
  description = "Nix flake for the only-zaps Vite React app";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
      };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          pkgs.nodejs_20
        ];

        shellHook = ''
          echo "only-zaps dev shell loaded."
          echo "Run 'npm install' (once) and then 'npm run dev' to start the Vite dev server."
        '';
      };
    };
}
