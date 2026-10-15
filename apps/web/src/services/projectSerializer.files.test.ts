import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph, DEFAULT_ONION_SKIN_SETTINGS, writeQuarFile } from '@quar/core';
import { createTimeline } from '@quar/animation';
import {
  ProjectFileCancelledError,
  downloadProjectFile,
  readProjectFile,
  serializeProject,
  uploadProjectFile,
} from './projectSerializer';

const project = serializeProject('File Test', new SceneGraph(), {
  timeline: createTimeline({ duration: 60, frameRate: 24 }),
  timelineDuration: 60,
  frameRate: 24,
  autoKeyframe: false,
  onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
});

let picker: HTMLInputElement | undefined;
let clickSpy: ReturnType<typeof vi.spyOn> | undefined;
let createObjectURLDescriptor: PropertyDescriptor | undefined;
let revokeObjectURLDescriptor: PropertyDescriptor | undefined;

afterEach(() => {
  clickSpy?.mockRestore();
  clickSpy = undefined;
  picker?.remove();
  picker = undefined;
  vi.useRealTimers();

  if (createObjectURLDescriptor) {
    Object.defineProperty(URL, 'createObjectURL', createObjectURLDescriptor);
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL');
  }
  if (revokeObjectURLDescriptor) {
    Object.defineProperty(URL, 'revokeObjectURL', revokeObjectURLDescriptor);
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
});

function interceptFilePicker() {
  clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    picker = this;
  });
}

describe('project file import/export', () => {
  it('keeps the download URL alive until the browser can start the download', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:project');
    const revokeObjectURL = vi.fn();
    createObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    revokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadProjectFile('File Test', project);

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:project');
    anchorClick.mockRestore();
  });

  it('imports a binary .quar file selected from the attached picker', async () => {
    interceptFilePicker();
    const imported = uploadProjectFile();

    expect(picker).toBeDefined();
    expect(picker?.isConnected).toBe(true);
    expect(picker?.accept).toContain('.quar');

    const binary = writeQuarFile(project);
    const file = new File([binary], 'project.quar', { type: 'application/octet-stream' });
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
    picker!.dispatchEvent(new Event('change'));

    await expect(imported).resolves.toMatchObject({
      version: '3.0',
      name: 'File Test',
    });
    expect(picker?.isConnected).toBe(false);
  });

  it('reads a dropped binary .quar file directly', async () => {
    const file = new File([writeQuarFile(project)], 'dropped-project.quar', {
      type: 'application/octet-stream',
    });

    await expect(readProjectFile(file)).resolves.toMatchObject({
      version: '3.0',
      name: 'File Test',
    });
  });

  it('rejects dropped project files larger than 50MB', async () => {
    const file = { size: 50 * 1024 * 1024 + 1 } as File;

    await expect(readProjectFile(file)).rejects.toThrow('Maximum size is 50MB');
  });

  it('settles and removes the picker when file selection is cancelled', async () => {
    interceptFilePicker();
    const imported = uploadProjectFile();

    picker!.dispatchEvent(new Event('cancel'));

    await expect(imported).rejects.toBeInstanceOf(ProjectFileCancelledError);
    expect(picker?.isConnected).toBe(false);
  });
});
