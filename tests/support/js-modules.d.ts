// The console's pages and build tools are plain JavaScript (no declaration files). This tells the typechecker that importing them from a test is fine and gives them the type `any`.
declare module "*.js";
declare module "*.mjs";
