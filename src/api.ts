import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Analysis, Label } from "./types";

export const pickPdf = async (): Promise<string | null> => {
  const r = await open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  return typeof r === "string" ? r : null;
};

export const pickSavePath = (defaultPath: string): Promise<string | null> =>
  save({ defaultPath, filters: [{ name: "PDF", extensions: ["pdf"] }] });

export const readFileB64 = (path: string) => invoke<string>("read_file_b64", { path });

export const analyzePage = (pngB64: string) => invoke<Analysis>("analyze_page", { pngB64 });

export interface PageLabels {
  page: number;
  view: [number, number, number, number];
  dpi: number;
  font_px: number;
  labels: Label[];
}

export const exportPdf = (src: string, dst: string, pages: PageLabels[], color: [number, number, number]) =>
  invoke<void>("export_pdf", { req: { src, dst, color, pages } });
