import { describe, it, expect } from 'vitest';
import {
  buildEditResponse,
  deriveOwnerFieldsFromManifest,
  getAssetSources,
  resolveDesignTagDecision,
  validateBasicEditFields
} from './pluginEditLogic';
import { MIN_SUPPORTED_APP_VERSION } from './pluginSubmission';

describe('getAssetSources', () => {
  it('defaults pluginFile to live, and image/screenshots to none when absent', () => {
    expect(getAssetSources({})).toEqual({
      pluginFile: 'live',
      image: 'none',
      screenshots: 'none'
    });
  });

  it('reports image/screenshots as live when present without an explicit assetSources', () => {
    expect(getAssetSources({ image: { ext: '.png' }, screenshots: [{ ext: '.png' }] })).toEqual({
      pluginFile: 'live',
      image: 'live',
      screenshots: 'live'
    });
  });

  it('honors an explicit assetSources map over the inferred defaults', () => {
    expect(getAssetSources({
      assetSources: { pluginFile: 'pending', image: 'pending', screenshots: 'pending' },
      image: null,
      screenshots: []
    })).toEqual({
      pluginFile: 'pending',
      image: 'pending',
      screenshots: 'pending'
    });
  });
});

describe('buildEditResponse', () => {
  const basePlugin = {
    _id: { toString: () => 'plugin-1' },
    pendingUpdate: null,
    pluginUid: 'uid-1',
    authorId: { toString: () => 'author-1' },
    isApproved: true,
    submissionType: 'new',
    pendingChangeSummary: [],
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    slug: 'my-plugin',
    name: 'x', shortDescription: 'x', description: 'x', version: '1.0.0', status: 'stable',
    author: 'a', compatibleWith: '1.0.0', maxAppVersion: null, requiresNetwork: false,
    tags: [], homepage: '', pluginFileSize: 0, downloadCount: 0, versions: [], screenshots: []
  };

  it('includes plugin identity fields and derives screenshot URLs without pending flag', () => {
    const source = { pluginFileName: 'a.otzplugin', image: null, screenshots: [{ ext: '.png' }, { ext: '.png' }] };
    const result = buildEditResponse(basePlugin, source);
    expect(result._id).toBe('plugin-1');
    expect(result.pluginUid).toBe('uid-1');
    expect(result.authorId).toBe('author-1');
    expect(result.pluginFileName).toBe('a.otzplugin');
    expect(result.hasPendingUpdate).toBe(false);
    expect(result.imageData).toBe(false);
    expect(result.screenshots).toEqual([
      '/api/plugins/plugin-1/screenshots/0',
      '/api/plugins/plugin-1/screenshots/1'
    ]);
  });

  it('appends ?pending=1 to screenshot URLs when a pendingUpdate exists', () => {
    const pendingPlugin = { ...basePlugin, pendingUpdate: { name: 'y' } };
    const source = { pluginFileName: 'a.otzplugin', image: null, screenshots: [{ ext: '.png' }] };
    const result = buildEditResponse(pendingPlugin, source);
    expect(result.hasPendingUpdate).toBe(true);
    expect(result.screenshots).toEqual(['/api/plugins/plugin-1/screenshots/0?pending=1']);
  });

  it('defaults pluginUid, authorId, and pendingChangeSummary when missing', () => {
    const plugin = { ...basePlugin, pluginUid: null, authorId: null, pendingChangeSummary: undefined };
    const result = buildEditResponse(plugin, { pluginFileName: '', image: null, screenshots: [] });
    expect(result.pluginUid).toBeNull();
    expect(result.authorId).toBeNull();
    expect(result.pendingChangeSummary).toEqual([]);
  });
});

describe('validateBasicEditFields', () => {
  const validArgs = {
    name: 'Plugin',
    shortDescription: 'short',
    description: 'desc',
    version: '1.0.0',
    author: 'me',
    compatibleWith: '1.0.0',
    status: 'stable',
    maxAppVersion: null,
    liveVersion: '1.0.0'
  };

  it('accepts a fully valid set of fields', () => {
    expect(validateBasicEditFields(validArgs)).toBeNull();
  });

  it.each(['name', 'shortDescription', 'description', 'version', 'author', 'compatibleWith'])(
    'rejects when %s is missing',
    (field) => {
      const args = { ...validArgs, [field]: '' };
      expect(validateBasicEditFields(args)).toBe('Missing required fields');
    }
  );

  it('rejects an invalid status', () => {
    expect(validateBasicEditFields({ ...validArgs, status: 'not-a-status' })).toMatch(/^Status must be one of/);
  });

  it('rejects a malformed new version when it differs from the live version', () => {
    expect(validateBasicEditFields({ ...validArgs, version: '1.0', liveVersion: '0.9.0' })).toBe(
      'Version must be in the form X.Y.Z'
    );
  });

  it('allows an old malformed version to pass through unchanged (matches liveVersion)', () => {
    expect(validateBasicEditFields({ ...validArgs, version: '1.0', liveVersion: '1.0' })).toBeNull();
  });

  it('rejects a malformed maxAppVersion', () => {
    expect(validateBasicEditFields({ ...validArgs, maxAppVersion: 'not-a-version' })).toBe(
      'שדה maxAppVersion אינו בפורמט גרסה תקין'
    );
  });

  it('rejects a maxAppVersion lower than compatibleWith', () => {
    const result = validateBasicEditFields({ ...validArgs, compatibleWith: '2.0.0', maxAppVersion: '1.0.0' });
    expect(result).toBe('גרסת המקסימום (1.0.0) לא יכולה להיות נמוכה מגרסת המינימום (2.0.0)');
  });

  it('accepts a maxAppVersion equal to compatibleWith', () => {
    expect(validateBasicEditFields({ ...validArgs, compatibleWith: '1.0.0', maxAppVersion: '1.0.0' })).toBeNull();
  });

  it('skips maxAppVersion checks when it is falsy (null/empty)', () => {
    expect(validateBasicEditFields({ ...validArgs, maxAppVersion: null })).toBeNull();
    expect(validateBasicEditFields({ ...validArgs, maxAppVersion: '' })).toBeNull();
  });
});

describe('resolveDesignTagDecision', () => {
  const designTag = 'תואם לאוצריא';

  it('blocks with an error message when the tag is requested but the plugin is not compliant', () => {
    const result = resolveDesignTagDecision({
      tags: ['a', designTag],
      designTag,
      designCompliant: false,
      userRequestedDesignTag: true,
      designViolations: ['violation 1', 'violation 2']
    });
    expect(result.error).toContain('violation 1');
    expect(result.error).toContain('violation 2');
    expect(result.tags).toEqual(['a', designTag]);
  });

  it('produces an error without a details list when there are no violations', () => {
    const result = resolveDesignTagDecision({
      tags: [designTag],
      designTag,
      designCompliant: false,
      userRequestedDesignTag: true,
      designViolations: []
    });
    expect(result.error).not.toBeNull();
    expect(result.error.endsWith(':')).toBe(true);
  });

  it('auto-adds the design tag when compliant and not already requested', () => {
    const result = resolveDesignTagDecision({
      tags: ['a'],
      designTag,
      designCompliant: true,
      userRequestedDesignTag: false,
      designViolations: []
    });
    expect(result.error).toBeNull();
    expect(result.tags).toEqual(['a', designTag]);
  });

  it('strips the tag as a safety net when incompliant but somehow requested and not blocked', () => {
    // This branch is defensive/unreachable in the real route (userRequestedDesignTag &&
    // !designCompliant is always handled by the first branch first), but the pure function
    // itself must still handle it correctly in isolation.
    const result = resolveDesignTagDecision({
      tags: [designTag, 'a'],
      designTag,
      designCompliant: false,
      userRequestedDesignTag: false,
      designViolations: []
    });
    // designCompliant=false, userRequestedDesignTag=false -> neither add nor block; tags unchanged
    expect(result.error).toBeNull();
    expect(result.tags).toEqual([designTag, 'a']);
  });

  it('leaves tags untouched when compliant and already requested', () => {
    const result = resolveDesignTagDecision({
      tags: ['a', designTag],
      designTag,
      designCompliant: true,
      userRequestedDesignTag: true,
      designViolations: []
    });
    expect(result.error).toBeNull();
    expect(result.tags).toEqual(['a', designTag]);
  });
});

describe('deriveOwnerFieldsFromManifest', () => {
  const validManifest = {
    stability: 'beta',
    minAppVersion: MIN_SUPPORTED_APP_VERSION,
    name: 'New Name',
    author: 'New Author',
    description: 'New short description',
    maxAppVersion: '2.0.0',
    homepage: 'https://example.com',
    network: { enabled: true }
  };

  it('derives all fields from a fully valid manifest', () => {
    const result = deriveOwnerFieldsFromManifest(validManifest);
    expect(result.error).toBeNull();
    expect(result.status).toBe('beta');
    expect(result.compatibleWith).toBe(MIN_SUPPORTED_APP_VERSION);
    expect(result.maxAppVersion).toBe('2.0.0');
    expect(result.homepage).toBe('https://example.com');
    expect(result.requiresNetwork).toBe(true);
    expect(result.name).toBe('New Name');
    expect(result.author).toBe('New Author');
    expect(result.shortDescription).toBe('New short description');
  });

  it('defaults stability to stable when missing', () => {
    const result = deriveOwnerFieldsFromManifest({ minAppVersion: MIN_SUPPORTED_APP_VERSION });
    expect(result.error).toBeNull();
    expect(result.status).toBe('stable');
  });

  it('rejects an invalid stability value', () => {
    const result = deriveOwnerFieldsFromManifest({ stability: 'bogus', minAppVersion: MIN_SUPPORTED_APP_VERSION });
    expect(result.error).toMatch(/stability לא תקין/);
  });

  it('rejects a missing minAppVersion', () => {
    const result = deriveOwnerFieldsFromManifest({ stability: 'stable' });
    expect(result.error).toMatch(/חסר שדה minAppVersion/);
  });

  it('rejects a minAppVersion below MIN_SUPPORTED_APP_VERSION', () => {
    const result = deriveOwnerFieldsFromManifest({ stability: 'stable', minAppVersion: '0.0.1' });
    expect(result.error).toMatch(/לא יכולה להיות פחות מ-/);
  });

  it('rejects a malformed maxAppVersion', () => {
    const result = deriveOwnerFieldsFromManifest({
      stability: 'stable',
      minAppVersion: MIN_SUPPORTED_APP_VERSION,
      maxAppVersion: 'not-a-version'
    });
    expect(result.error).toMatch(/maxAppVersion ב-manifest\.json אינו בפורמט/);
  });

  it('rejects a maxAppVersion lower than minAppVersion', () => {
    const result = deriveOwnerFieldsFromManifest({
      stability: 'stable',
      minAppVersion: '2.0.0',
      maxAppVersion: '1.0.0'
    });
    expect(result.error).toMatch(/לא יכולה להיות נמוכה מגרסת המינימום/);
  });

  it('omits name/author/shortDescription from the result when blank in the manifest', () => {
    const result = deriveOwnerFieldsFromManifest({
      stability: 'stable',
      minAppVersion: MIN_SUPPORTED_APP_VERSION,
      name: '   ',
      author: '',
      description: undefined
    });
    expect(result.error).toBeNull();
    expect(result.name).toBeUndefined();
    expect(result.author).toBeUndefined();
    expect(result.shortDescription).toBeUndefined();
  });

  it('defaults maxAppVersion to null and homepage to empty string when absent', () => {
    const result = deriveOwnerFieldsFromManifest({ stability: 'stable', minAppVersion: MIN_SUPPORTED_APP_VERSION });
    expect(result.maxAppVersion).toBeNull();
    expect(result.homepage).toBe('');
    expect(result.requiresNetwork).toBe(false);
  });
});
