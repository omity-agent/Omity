import { AsyncFileDialog } from "@bindrs/rfd";
import folderDialog from "../../../settings/folderDialog.json";
import { writeSync } from "node:fs";

export async function showNativeFolderDialog() {
  const directory = await new AsyncFileDialog().setTitle(folderDialog.title).pickFolder();
  writeSync(1, JSON.stringify(directory?.path() ?? null));
}
