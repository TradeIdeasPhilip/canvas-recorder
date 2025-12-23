declare module "parse-svg-path" {
  type SVGCommand = [string, ...number[]];
  function parse(path: string): SVGCommand[];
  export = parse;
}

declare module "abs-svg-path" {
  type SVGCommand = [string, ...number[]];
  function abs(commands: SVGCommand[]): SVGCommand[];
  export = abs;
}

declare module "normalize-svg-path" {
  type SVGCommand = [string, ...number[]];
  function normalize(commands: SVGCommand[]): SVGCommand[];
  export = normalize;
}
