/** Entirely fictional lab-wiki fixtures. No real protocol content. */

export interface FixtureSpace {
  id: string;
  key: string;
  name: string;
  type: string;
}

export interface FixturePage {
  id: string;
  type: "page";
  title: string;
  spaceKey: string;
  parentId: string | null;
  labels: string[];
  storage: string;
  view: string;
  versions: FixtureVersion[];
}

export interface FixtureVersion {
  number: number;
  when: string;
  by: { username: string; displayName: string };
  message: string;
}

export interface FixtureAttachment {
  id: string;
  pageId: string;
  title: string;
  mediaType: string;
  fileSize: number;
  bytes: string;
}

export const SYNTHETIC_SPACES: FixtureSpace[] = [
  { id: "11", key: "LAB", name: "SYNTHETIC Lab Wiki", type: "global" },
  { id: "12", key: "QC", name: "SYNTHETIC QC Wiki", type: "global" },
  { id: "13", key: "SECRET", name: "SYNTHETIC Restricted Wiki", type: "global" },
];

const CALIBRATION_STORAGE = [
  "<p>SYNTHETIC calibration overview. See ",
  '<ac:link><ri:page ri:content-title="Size Measurement" ri:space-key="LAB" /></ac:link>',
  " and ",
  '<ac:link><ri:page ri:content-title="Buffer Prep" /></ac:link>',
  " plus ",
  '<ac:link><ri:attachment ri:filename="notes.txt" /></ac:link>.',
  "</p>",
].join("");

export const SYNTHETIC_PAGES: FixturePage[] = [
  {
    id: "1001",
    type: "page",
    title: "Lab Home",
    spaceKey: "LAB",
    parentId: null,
    labels: ["synthetic", "home"],
    storage: "<p>SYNTHETIC lab home</p>",
    view: "<p>SYNTHETIC lab home</p>",
    versions: [
      {
        number: 1,
        when: "2024-01-02T09:00:00.000Z",
        by: { username: "synth.author", displayName: "Synthetic Author" },
        message: "SYNTHETIC seed",
      },
    ],
  },
  {
    id: "1002",
    type: "page",
    title: "Calibration SOP",
    spaceKey: "LAB",
    parentId: "1001",
    labels: ["synthetic", "sop"],
    storage: CALIBRATION_STORAGE,
    view: "<p>SYNTHETIC calibration overview (view html)</p>",
    versions: [
      {
        number: 1,
        when: "2024-01-15T10:00:00.000Z",
        by: { username: "synth.author", displayName: "Synthetic Author" },
        message: "SYNTHETIC initial",
      },
      {
        number: 2,
        when: "2024-06-20T11:00:00.000Z",
        by: { username: "synth.reviewer", displayName: "Synthetic Reviewer" },
        message: "SYNTHETIC revision",
      },
      {
        number: 3,
        when: "2025-01-08T09:30:00.000Z",
        by: { username: "synth.author", displayName: "Synthetic Author" },
        message: "SYNTHETIC current",
      },
    ],
  },
  {
    id: "1003",
    type: "page",
    title: "Size Measurement",
    spaceKey: "LAB",
    parentId: "1002",
    labels: ["synthetic"],
    storage: "<p>SYNTHETIC size measurement child page</p>",
    view: "<p>SYNTHETIC size measurement child page</p>",
    versions: [
      {
        number: 1,
        when: "2024-03-01T12:00:00.000Z",
        by: { username: "synth.author", displayName: "Synthetic Author" },
        message: "SYNTHETIC seed",
      },
    ],
  },
  {
    id: "1004",
    type: "page",
    title: "Buffer Prep",
    spaceKey: "LAB",
    parentId: "1001",
    labels: ["synthetic"],
    storage: "<p>SYNTHETIC buffer prep</p>",
    view: "<p>SYNTHETIC buffer prep</p>",
    versions: [
      {
        number: 1,
        when: "2024-03-02T12:00:00.000Z",
        by: { username: "synth.author", displayName: "Synthetic Author" },
        message: "SYNTHETIC seed",
      },
    ],
  },
  {
    id: "2001",
    type: "page",
    title: "QC Overview",
    spaceKey: "QC",
    parentId: null,
    labels: ["synthetic", "qc"],
    storage: "<p>SYNTHETIC qc overview</p>",
    view: "<p>SYNTHETIC qc overview</p>",
    versions: [
      {
        number: 1,
        when: "2024-04-01T08:00:00.000Z",
        by: { username: "synth.qc", displayName: "Synthetic QC" },
        message: "SYNTHETIC seed",
      },
    ],
  },
  {
    id: "3001",
    type: "page",
    title: "Restricted Note",
    spaceKey: "SECRET",
    parentId: null,
    labels: ["synthetic"],
    storage: "<p>SYNTHETIC restricted</p>",
    view: "<p>SYNTHETIC restricted</p>",
    versions: [
      {
        number: 1,
        when: "2024-05-01T08:00:00.000Z",
        by: { username: "synth.admin", displayName: "Synthetic Admin" },
        message: "SYNTHETIC seed",
      },
    ],
  },
];

export const SYNTHETIC_ATTACHMENTS: FixtureAttachment[] = [
  {
    id: "9001",
    pageId: "1002",
    title: "notes.txt",
    mediaType: "text/plain",
    fileSize: 28,
    bytes: "SYNTHETIC attachment body\n",
  },
];

export const VALID_PAT = "lab-pat-token";
export const VALID_USER = "labuser";
export const VALID_PASSWORD = "labpass";
