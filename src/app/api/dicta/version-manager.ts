import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { validateSafePath } from "./_lib";

export type VersionInfo = {
  version: number;
  timestamp: string;
  description: string;
  filename: string;
  size: number;
};

type Metadata = {
  versions: VersionInfo[];
  current_version: number;
};

export class VersionManager {
  filePath: string;
  versionsDir: string;
  metadataFile: string;
  metadata: Metadata;

  constructor(filePath: string) {
    validateSafePath(filePath);
    this.filePath = filePath;
    const baseDir = path.dirname(filePath);
    const filename = path.basename(filePath);
    const nameWithoutExt = path.parse(filename).name;
    this.versionsDir = path.join(baseDir, `.versions_${nameWithoutExt}`);
    this.metadataFile = path.join(this.versionsDir, "metadata.json");
    this.metadata = { versions: [], current_version: 1 };
  }

  async init() {
    await fs.mkdir(this.versionsDir, { recursive: true });
    await this.loadMetadata();
    if (!this.metadata.versions?.length) {
      await this.saveVersion("גירסה ראשונית");
    }
  }

  async loadMetadata() {
    if (fsSync.existsSync(this.metadataFile)) {
      try {
        const raw = await fs.readFile(this.metadataFile, "utf-8");
        this.metadata = JSON.parse(raw);
      } catch {
        this.metadata = { versions: [], current_version: 1 };
      }
    } else {
      this.metadata = { versions: [], current_version: 1 };
    }
  }

  async saveMetadata() {
    await fs.writeFile(this.metadataFile, JSON.stringify(this.metadata, null, 2), "utf-8");
  }

  async saveVersion(description = "") {
    if (!this.filePath || !fsSync.existsSync(this.filePath)) return null;

    const versionNum = (this.metadata.versions?.length || 0) + 1;
    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    const versionFilename = `v${versionNum}_${path.basename(this.filePath)}`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const versionPath = path.join(this.versionsDir, versionFilename);

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.copyFile(this.filePath, versionPath);

    const stat = await fs.stat(versionPath);
    const versionInfo: VersionInfo = {
      version: versionNum,
      timestamp,
      description,
      filename: versionFilename,
      size: stat.size,
    };

    if (!this.metadata.versions) this.metadata.versions = [];
    this.metadata.versions.push(versionInfo);
    this.metadata.current_version = versionNum;
    await this.saveMetadata();

    return versionNum;
  }

  getCurrentVersion() {
    return this.metadata.current_version || 1;
  }

  getAllVersions() {
    return this.metadata.versions || [];
  }

  async restoreVersionByFilename(filename: string) {
    const versionInfo = this.metadata.versions.find((v) => v.filename === filename);
    if (!versionInfo) return false;
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const versionPath = path.join(this.versionsDir, versionInfo.filename);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!fsSync.existsSync(versionPath)) return false;

    await this.saveVersion(`לפני שחזור לגירסה ${versionInfo.version}`);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fs.copyFile(versionPath, this.filePath);
    this.metadata.current_version = versionInfo.version;
    await this.saveMetadata();
    return true;
  }

  async deleteVersion(versionNum: number) {
    if (versionNum === this.getCurrentVersion()) return { success: false, message: "לא ניתן למחוק את הגירסה הנוכחית" };
    const versionInfo = this.metadata.versions.find((v) => v.version === versionNum);
    if (!versionInfo) return { success: false, message: "גירסה לא נמצאה" };

    const versionPath = path.join(this.versionsDir, versionInfo.filename);
    if (fsSync.existsSync(versionPath)) await fs.unlink(versionPath);

    this.metadata.versions = this.metadata.versions.filter((v) => v.version !== versionNum);
    await this.saveMetadata();
    return { success: true, message: "הגירסה נמחקה בהצלחה" };
  }

  getVersionCount() {
    return this.metadata.versions?.length || 0;
  }
}
