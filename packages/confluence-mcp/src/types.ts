export interface PageSummary {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly spaceKey: string;
}

export interface PageVersion {
  readonly number: number;
  readonly when: string | null;
  readonly author: string | null;
  readonly username: string | null;
  readonly message: string | null;
}

export interface PageDetail {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly spaceKey: string;
  readonly ancestors: readonly { id: string; title: string }[];
  readonly body: {
    readonly storage?: string;
  };
}

export type OutgoingEdge =
  | {
      readonly kind: "page";
      readonly fromId: string;
      readonly title: string;
      readonly spaceKey: string;
      readonly toId: string | null;
    }
  | {
      readonly kind: "attachment";
      readonly fromId: string;
      readonly filename: string;
      readonly toId: string | null;
    };

export interface AttachmentSummary {
  readonly id: string;
  readonly title: string;
}

export interface SpaceGraph {
  readonly spaceKey: string;
  readonly generatedAt: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly truncated: boolean;
  readonly nodes: readonly {
    readonly id: string;
    readonly title: string;
    readonly type: string;
    readonly spaceKey: string;
  }[];
  readonly edges: readonly {
    readonly type: "parent" | "link";
    readonly from: string;
    readonly to: string;
    readonly label?: string;
  }[];
}
