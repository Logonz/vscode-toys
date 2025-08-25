// types.ts
export interface LayerActivateInput {
  layerName: string;
  layerType: "normal" | "switch";
  timeout?: number;
  command?: string;
}

export interface LayerDeactivateInput {
  layerName: string;
  deactivateAll?: boolean;
}

export interface HyperLayer {
  name: string;
  timeout?: number;
  enabled?: boolean;
}