export type BodyMode = "storage" | "view" | "both" | "none";

export interface SpaceSummary {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly type: string;
}

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
  readonly spaceName: string | null;
  readonly version: PageVersion | null;
  readonly ancestors: readonly { id: string; title: string }[];
  readonly labels: readonly string[];
  readonly body: {
    readonly storage?: string;
    readonly view?: string;
  };
  readonly webui: string | null;
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
  readonly mediaType: string | null;
  readonly fileSize: number | null;
  readonly downloadPath: string | null;
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

export interface InstanceCheck {
  readonly ok: boolean;
  readonly baseUrl: string;
  readonly restApi: string;
  readonly auth: "pat" | "basic";
  readonly allowlist: readonly string[] | null;
  readonly message: string;
  readonly sampleSpaceKeys: readonly string[];
}
