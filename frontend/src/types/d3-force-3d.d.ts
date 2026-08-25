// Minimal ambient type declarations for the untyped `d3-force-3d` package.
declare module "d3-force-3d" {
  export interface SimulationNodeDatum {
    index?: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  export interface SimulationLinkDatum<NodeDatum extends SimulationNodeDatum> {
    index?: number;
    source?: NodeDatum | string | number;
    target?: NodeDatum | string | number;
  }

  export interface Simulation<
    NodeDatum extends SimulationNodeDatum,
    LinkDatum extends SimulationLinkDatum<NodeDatum> | undefined,
  > {
    nodes(): NodeDatum[];
    nodes(nodes: NodeDatum[]): this;
    force(name: string, force: unknown): this;
    on(
      typenames: string,
      listener: ((this: Simulation<NodeDatum, LinkDatum>) => void) | null,
    ): this;
    alpha(): number;
    alpha(alpha: number): this;
    alphaDecay(): number;
    alphaDecay(decay: number): this;
    alphaMin(): number;
    alphaMin(min: number): this;
    stop(): this;
    restart(): this;
    tick(iterations?: number): this;
  }

  export interface ForceLink<
    NodeDatum extends SimulationNodeDatum,
    LinkDatum extends SimulationLinkDatum<NodeDatum>,
  > {
    (alpha: number): void;
    links(): LinkDatum[];
    links(links: LinkDatum[]): this;
    id(): (d: NodeDatum, i: number, data: NodeDatum[]) => string | number;
    id(id: (d: NodeDatum, i: number, data: NodeDatum[]) => string | number): this;
    distance(): number;
    distance(distance: number): this;
    strength(): number;
    strength(strength: number): this;
  }

  export interface ForceManyBody {
    (alpha: number): void;
    strength(): number;
    strength(strength: number): this;
  }

  export interface ForceCenter {
    (alpha: number): void;
    strength(): number;
    strength(strength: number): this;
  }

  export interface ForcePosition {
    (alpha: number): void;
    strength(): number;
    strength(strength: number): this;
  }

  export interface ForceCollide {
    (alpha: number): void;
    radius(): number;
    radius(radius: number): this;
    strength(): number;
    strength(strength: number): this;
  }

  export function forceSimulation<NodeDatum extends SimulationNodeDatum>(
    nodes?: NodeDatum[],
    numDimensions?: number,
  ): Simulation<NodeDatum, undefined>;

  export function forceLink<
    NodeDatum extends SimulationNodeDatum,
    LinkDatum extends SimulationLinkDatum<NodeDatum>,
  >(links?: LinkDatum[]): ForceLink<NodeDatum, LinkDatum>;

  export function forceManyBody(): ForceManyBody;
  export function forceCenter(x?: number, y?: number, z?: number): ForceCenter;
  export function forceX(x?: number): ForcePosition;
  export function forceY(y?: number): ForcePosition;
  export function forceZ(z?: number): ForcePosition;
  export function forceCollide(): ForceCollide;
}
