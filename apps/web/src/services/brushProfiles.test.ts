/**
 * Tests for brush profiles: which are the document's own, and reading them
 * back from a file.
 */

import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_BRUSH_PROFILES,
  customBrushProfiles,
  readBrushProfiles,
  withBuiltInProfiles,
} from './brushProfiles';

const diamond = { id: 'custom-1', name: 'Diamond', samples: [0, 0.5, 1, 0.5, 0] };

describe('brush profiles', () => {
  it('tells the document’s own from those that come with the editor', () => {
    expect(customBrushProfiles([...BUILT_IN_BRUSH_PROFILES, diamond])).toEqual([diamond]);
  });

  it('puts a document’s own after the built-in ones', () => {
    expect(withBuiltInProfiles([diamond])).toEqual([...BUILT_IN_BRUSH_PROFILES, diamond]);
  });

  it('reads the profiles a file holds, leaving out what a damaged one got wrong', () => {
    expect(
      readBrushProfiles([
        diamond,
        // The built-in ones aren't the file's to change
        { id: 'taper-out', name: 'Mine', samples: [1, 0] },
        { id: 'custom-1', name: 'Again', samples: [1, 1] },
        { id: 'one-sample', name: 'Short', samples: [1] },
        { id: 'not-numbers', name: 'Odd', samples: [1, 'wide'] },
        { id: 'too-wide', name: 'Wide', samples: [0, 7, Infinity] },
        { name: 'No id', samples: [1, 1] },
        null,
      ])
    ).toEqual([diamond, { id: 'too-wide', name: 'Wide', samples: [0, 1, 1] }]);
    expect(readBrushProfiles(undefined)).toEqual([]);
    expect(readBrushProfiles('not a list')).toEqual([]);
  });
});
