import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PurgePanel from './PurgePanel';
import ExportPanel from './ExportPanel';
import { modelValue } from './labels';

const jsonResponse = (body) => ({ ok: true, json: async () => body });
const asOf = '2026-10-04T00:00:00.000Z';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('purge approvals remain bound to the displayed scope', () => {
  it('discards an outstanding preview when filters change, then approves only the new scope', async () => {
    let resolvePreview;
    const pending = new Promise((resolve) => { resolvePreview = resolve; });
    const requests = [];
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (requests.length === 1) return pending;
      return Promise.resolve(jsonResponse(url.includes('dryRun')
        ? { success: true, count: 3, asOf, previewId: 'new-preview' }
        : { success: true, deleted: 3 }));
    }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PurgePanel models={[]} onPurged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('סוג:'), { target: { value: 'vote' } });
    fireEvent.click(screen.getByText('תצוגה מקדימה'));
    fireEvent.change(screen.getByLabelText('סוג:'), { target: { value: 'search' } });
    await act(async () => resolvePreview(jsonResponse({ success: true, count: 3, asOf, previewId: 'old-preview' })));
    expect(screen.queryByText('לאישור, הקלידו את מספר האירועים:')).not.toBeInTheDocument();
    expect(screen.queryByText('מחיקה לצמיתות')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('תצוגה מקדימה'));
    const confirmation = await screen.findByLabelText('לאישור, הקלידו את מספר האירועים:');
    fireEvent.change(confirmation, { target: { value: '3' } });
    fireEvent.click(screen.getByText('מחיקה לצמיתות'));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[1].body).toEqual({ type: 'search', replacePreviewId: 'old-preview' });
    expect(requests[2].body).toEqual({ type: 'search', asOf, previewId: 'new-preview', confirmCount: 3 });
  });

  it('invalidates an outstanding all-events preview when the checkbox changes', async () => {
    let resolvePreview;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolvePreview = resolve; })));
    render(<PurgePanel models={[]} onPurged={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('כל האירועים (מתעלם מהמסננים)'));
    fireEvent.click(screen.getByText('תצוגה מקדימה'));
    fireEvent.click(screen.getByLabelText('כל האירועים (מתעלם מהמסננים)'));
    await act(async () => resolvePreview(jsonResponse({ success: true, count: 99, asOf, previewId: 'all-preview' })));
    expect(screen.queryByText('מחיקה לצמיתות')).not.toBeInTheDocument();
  });

  it('keeps model identity and its approval stable when counts reorder the model rows', async () => {
    const a = { modelFamilyId: 'A', modelQuantization: 'int8' };
    const b = { modelFamilyId: 'B', modelQuantization: 'fp32' };
    const requests = [];
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      requests.push(JSON.parse(options.body));
      return Promise.resolve(jsonResponse(url.includes('dryRun')
        ? { success: true, count: 2, asOf, previewId: 'model-preview' }
        : { success: true, deleted: 2 }));
    }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render(<PurgePanel models={[a, b]} onPurged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('מודל:'), { target: { value: modelValue(a) } });
    fireEvent.click(screen.getByText('תצוגה מקדימה'));
    await screen.findByLabelText('לאישור, הקלידו את מספר האירועים:');
    view.rerender(<PurgePanel models={[b, a]} onPurged={vi.fn()} />);
    expect(screen.getByLabelText('מודל:').selectedOptions[0].textContent).toBe('A (int8)');
    fireEvent.change(screen.getByLabelText('לאישור, הקלידו את מספר האירועים:'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('מחיקה לצמיתות'));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({ modelFamilyId: 'A', modelQuantization: 'int8', asOf, previewId: 'model-preview', confirmCount: 2 });
  });

  it('does not widen an export when the selected model disappears from statistics', () => {
    const a = { modelFamilyId: 'A', modelQuantization: null };
    const view = render(<ExportPanel models={[a]} />);
    fireEvent.change(screen.getByLabelText('מודל:'), { target: { value: modelValue(a) } });
    const href = screen.getByText('הורדה').closest('a').getAttribute('href');
    view.rerender(<ExportPanel models={[]} />);
    expect(screen.getByText('הורדה').closest('a')).toHaveAttribute('href', href);
    expect(href).toContain('modelFamilyId=A');
    expect(href).toContain('noQuantization=1');
    expect(screen.getByLabelText('מודל:').selectedOptions[0].textContent).toBe('A (ללא קוונטיזציה)');
  });
});
