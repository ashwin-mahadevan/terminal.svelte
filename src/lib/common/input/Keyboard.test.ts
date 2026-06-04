import { describe, it, expect } from 'vitest';
import { evaluateKeyboardEvent } from '$lib/common/input/Keyboard';
import { IKeyboardResult, IKeyboardEvent } from '$lib/common/Types';

/**
 * A helper function for testing which allows passing in a partial event and defaults will be filled
 * in on it.
 */
function testEvaluateKeyboardEvent(partialEvent: {
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  keyCode?: number;
  code?: string;
  key?: string;
  type?: string;
}, partialOptions: {
  applicationCursorMode?: boolean;
  isMac?: boolean;
  macOptionIsMeta?: boolean;
} = {}): IKeyboardResult {
  const event: IKeyboardEvent = {
    altKey: partialEvent.altKey || false,
    ctrlKey: partialEvent.ctrlKey || false,
    shiftKey: partialEvent.shiftKey || false,
    metaKey: partialEvent.metaKey || false,
    keyCode: partialEvent.keyCode ?? 0,
    code: partialEvent.code || '',
    key: partialEvent.key || '',
    type: partialEvent.type || ''
  };
  const options = {
    applicationCursorMode: partialOptions.applicationCursorMode || false,
    isMac: partialOptions.isMac || false,
    macOptionIsMeta: partialOptions.macOptionIsMeta || false
  };
  return evaluateKeyboardEvent(event, options.applicationCursorMode, options.isMac, options.macOptionIsMeta);
}

describe('Keyboard', () => {
  describe('evaluateKeyEscapeSequence', () => {
    it('should return the correct escape sequence for unmodified keys', () => {
      // Backspace
      expect(testEvaluateKeyboardEvent({ keyCode: 8 }).key).toBe('\x7f'); // ^?
      // Tab
      expect(testEvaluateKeyboardEvent({ keyCode: 9 }).key).toBe('\t');
      // Return/enter
      expect(testEvaluateKeyboardEvent({ keyCode: 13 }).key).toBe('\r'); // CR
      // Escape
      expect(testEvaluateKeyboardEvent({ keyCode: 27 }).key).toBe('\x1b');
      // Page up, page down
      expect(testEvaluateKeyboardEvent({ keyCode: 33 }).key).toBe('\x1b[5~'); // CSI 5 ~
      expect(testEvaluateKeyboardEvent({ keyCode: 34 }).key).toBe('\x1b[6~'); // CSI 6 ~
      // End, Home
      expect(testEvaluateKeyboardEvent({ keyCode: 35 }).key).toBe('\x1b[F'); // SS3 F
      expect(testEvaluateKeyboardEvent({ keyCode: 36 }).key).toBe('\x1b[H'); // SS3 H
      // Left, up, right, down arrows
      expect(testEvaluateKeyboardEvent({ keyCode: 37 }).key).toBe('\x1b[D'); // CSI D
      expect(testEvaluateKeyboardEvent({ keyCode: 38 }).key).toBe('\x1b[A'); // CSI A
      expect(testEvaluateKeyboardEvent({ keyCode: 39 }).key).toBe('\x1b[C'); // CSI C
      expect(testEvaluateKeyboardEvent({ keyCode: 40 }).key).toBe('\x1b[B'); // CSI B
      // Insert
      expect(testEvaluateKeyboardEvent({ keyCode: 45 }).key).toBe('\x1b[2~'); // CSI 2 ~
      // Delete
      expect(testEvaluateKeyboardEvent({ keyCode: 46 }).key).toBe('\x1b[3~'); // CSI 3 ~
      // F1-F12
      expect(testEvaluateKeyboardEvent({ keyCode: 112 }).key).toBe('\x1bOP'); // SS3 P
      expect(testEvaluateKeyboardEvent({ keyCode: 113 }).key).toBe('\x1bOQ'); // SS3 Q
      expect(testEvaluateKeyboardEvent({ keyCode: 114 }).key).toBe('\x1bOR'); // SS3 R
      expect(testEvaluateKeyboardEvent({ keyCode: 115 }).key).toBe('\x1bOS'); // SS3 S
      expect(testEvaluateKeyboardEvent({ keyCode: 116 }).key).toBe('\x1b[15~'); // CSI 1 5 ~
      expect(testEvaluateKeyboardEvent({ keyCode: 117 }).key).toBe('\x1b[17~'); // CSI 1 7 ~
      expect(testEvaluateKeyboardEvent({ keyCode: 118 }).key).toBe('\x1b[18~'); // CSI 1 8 ~
      expect(testEvaluateKeyboardEvent({ keyCode: 119 }).key).toBe('\x1b[19~'); // CSI 1 9 ~
      expect(testEvaluateKeyboardEvent({ keyCode: 120 }).key).toBe('\x1b[20~'); // CSI 2 0 ~
      expect(testEvaluateKeyboardEvent({ keyCode: 121 }).key).toBe('\x1b[21~'); // CSI 2 1 ~
      expect(testEvaluateKeyboardEvent({ keyCode: 122 }).key).toBe('\x1b[23~'); // CSI 2 3 ~
      expect(testEvaluateKeyboardEvent({ keyCode: 123 }).key).toBe('\x1b[24~'); // CSI 2 4 ~
    });
    it('should return \\x1b[3;5~ for ctrl+delete', () => {
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 46 }).key).toBe('\x1b[3;5~');
    });
    it('should return \\x1b[3;2~ for shift+delete', () => {
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 46 }).key).toBe('\x1b[3;2~');
    });
    it('should return \\x1b[3;3~ for alt+delete', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 46 }).key).toBe('\x1b[3;3~');
    });
    it('should return \\x1b\\r for alt+enter', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 13 }).key).toBe('\x1b\r');
    });
    it('should return \\x1b\\x1b for alt+esc', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 27 }).key).toBe('\x1b\x1b');
    });
    it('should return \\x1b[5D for ctrl+left', () => {
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 37 }).key).toBe('\x1b[1;5D'); // CSI 5 D
    });
    it('should return \\x1b[5C for ctrl+right', () => {
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 39 }).key).toBe('\x1b[1;5C'); // CSI 5 C
    });
    it('should return \\x1b[5A for ctrl+up', () => {
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 38 }).key).toBe('\x1b[1;5A'); // CSI 5 A
    });
    it('should return \\x1b[5B for ctrl+down', () => {
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 40 }).key).toBe('\x1b[1;5B'); // CSI 5 B
    });
    it('should return \\x08 for ctrl+backspace', () => {
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 8 }).key).toBe('\x08');
    });
    it('should return \\x1b\\x7f for alt+backspace', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 8 }).key).toBe('\x1b\x7f');
    });
    it('should return \\x1b\\x08 for ctrl+alt+backspace', () => {
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, altKey: true, keyCode: 8 }).key).toBe('\x1b\x08');
    });
    it('should return \\x1b[3;2~ for shift+delete', () => {
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 46 }).key).toBe('\x1b[3;2~');
    });
    it('should return \\x1b[3;3~ for alt+delete', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 46 }).key).toBe('\x1b[3;3~');
    });

    describe('On non-macOS platforms', () => {
      // Evalueate alt + arrow key movement, which is a feature of terminal emulators but not VT100
      // http://unix.stackexchange.com/a/108106
      it('should return \\x1b[1;3D for alt+left', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 37 }, { isMac: false }).key).toBe('\x1b[1;3D'); // CSI 1;3 D
      });
      it('should return \\x1b[1;3C for alt+right', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 39 }, { isMac: false }).key).toBe('\x1b[1;3C'); // CSI 1;3 C
      });
      it('should return \\x1b[1;3A for alt+up', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 38 }, { isMac: false }).key).toBe('\x1b[1;3A'); // CSI 1;3 A
      });
      it('should return \\x1b[1;3B for alt+down', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 40 }, { isMac: false }).key).toBe('\x1b[1;3B'); // CSI 1;3 B
      });
      it('should return \\x1ba for alt+a', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 65 }, { isMac: false }).key).toBe('\x1ba');
      });
      it('should return \\x1b\\x20 for alt+space', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 32 }, { isMac: false }).key).toBe('\x1b\x20');
      });
      it('should return \\x1b\\x00 for ctrl+alt+space', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, ctrlKey: true, keyCode: 32 }, { isMac: false }).key).toBe('\x1b\x00');
      });
    });

    describe('On macOS platforms', () => {
      it('should return \\x1b[1;3D for alt+left', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 37 }, { isMac: true }).key).toBe('\x1b[1;3D'); // CSI 1;3 D
      });
      it('should return \\x1b[1;3C for alt+right', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 39 }, { isMac: true }).key).toBe('\x1b[1;3C'); // CSI 1;3 C
      });
      it('should return \\x1b[1;3A for alt+up', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 38 }, { isMac: true }).key).toBe('\x1b[1;3A'); // CSI 1;3 A
      });
      it('should return \\x1b[1;3B for alt+down', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 40 }, { isMac: true }).key).toBe('\x1b[1;3B'); // CSI 1;3 B
      });
      it('should return undefined for alt+a', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 65 }, { isMac: true }).key).toBe(undefined);
      });
    });

    describe('with macOptionIsMeta', () => {
      it('should return \\x1ba for alt+a', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 65 }, { isMac: true, macOptionIsMeta: true }).key).toBe('\x1ba');
      });

      it('should return \\x1b\\x1b for alt+enter', () => {
        expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 13 }, { isMac: true, macOptionIsMeta: true }).key).toBe('\x1b\r');
      });
    });

    it('should return \\x1b[1;3A for alt+up', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 38 }).key).toBe('\x1b[1;3A'); // CSI 1;3 A
    });
    it('should return \\x1b[1;3B for alt+down', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 40 }).key).toBe('\x1b[1;3B'); // CSI 1;3 B
    });
    it('should return the correct escape sequence for modified F1-F12 keys', () => {
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 112 }).key).toBe('\x1b[1;2P');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 113 }).key).toBe('\x1b[1;2Q');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 114 }).key).toBe('\x1b[1;2R');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 115 }).key).toBe('\x1b[1;2S');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 116 }).key).toBe('\x1b[15;2~');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 117 }).key).toBe('\x1b[17;2~');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 118 }).key).toBe('\x1b[18;2~');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 119 }).key).toBe('\x1b[19;2~');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 120 }).key).toBe('\x1b[20;2~');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 121 }).key).toBe('\x1b[21;2~');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 122 }).key).toBe('\x1b[23;2~');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 123 }).key).toBe('\x1b[24;2~');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 112 }).key).toBe('\x1b[1;3P');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 113 }).key).toBe('\x1b[1;3Q');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 114 }).key).toBe('\x1b[1;3R');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 115 }).key).toBe('\x1b[1;3S');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 116 }).key).toBe('\x1b[15;3~');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 117 }).key).toBe('\x1b[17;3~');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 118 }).key).toBe('\x1b[18;3~');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 119 }).key).toBe('\x1b[19;3~');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 120 }).key).toBe('\x1b[20;3~');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 121 }).key).toBe('\x1b[21;3~');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 122 }).key).toBe('\x1b[23;3~');
      expect(testEvaluateKeyboardEvent({ altKey: true, keyCode: 123 }).key).toBe('\x1b[24;3~');

      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 112 }).key).toBe('\x1b[1;5P');
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 113 }).key).toBe('\x1b[1;5Q');
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 114 }).key).toBe('\x1b[1;5R');
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 115 }).key).toBe('\x1b[1;5S');
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 116 }).key).toBe('\x1b[15;5~');
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 117 }).key).toBe('\x1b[17;5~');
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 118 }).key).toBe('\x1b[18;5~');
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 119 }).key).toBe('\x1b[19;5~');
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 120 }).key).toBe('\x1b[20;5~');
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 121 }).key).toBe('\x1b[21;5~');
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 122 }).key).toBe('\x1b[23;5~');
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, keyCode: 123 }).key).toBe('\x1b[24;5~');
    });

    // Characters using ctrl+alt sequences
    it('should return proper sequence for ctrl+alt+a', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, ctrlKey: true, keyCode: 65 }).key).toBe('\x1b\x01');
    });

    // Characters using alt sequences (numbers)
    it('should return proper sequences for alt+0', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 48 }).key).toBe('\x1b0');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 48 }).key).toBe('\x1b)');
    });
    it('should return proper sequences for alt+1', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 49 }).key).toBe('\x1b1');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 49 }).key).toBe('\x1b!');
    });
    it('should return proper sequences for alt+2', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 50 }).key).toBe('\x1b2');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 50 }).key).toBe('\x1b@');
    });
    it('should return proper sequences for alt+3', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 51 }).key).toBe('\x1b3');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 51 }).key).toBe('\x1b#');
    });
    it('should return proper sequences for alt+4', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 52 }).key).toBe('\x1b4');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 52 }).key).toBe('\x1b$');
    });
    it('should return proper sequences for alt+5', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 53 }).key).toBe('\x1b5');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 53 }).key).toBe('\x1b%');
    });
    it('should return proper sequences for alt+6', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 54 }).key).toBe('\x1b6');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 54 }).key).toBe('\x1b^');
    });
    it('should return proper sequences for alt+7', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 55 }).key).toBe('\x1b7');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 55 }).key).toBe('\x1b&');
    });
    it('should return proper sequences for alt+8', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 56 }).key).toBe('\x1b8');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 56 }).key).toBe('\x1b*');
    });
    it('should return proper sequences for alt+9', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 57 }).key).toBe('\x1b9');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 57 }).key).toBe('\x1b(');
    });

    // Characters using alt sequences (special chars)
    it('should return proper sequences for alt+;', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 186 }).key).toBe('\x1b;');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 186 }).key).toBe('\x1b:');
    });
    it('should return proper sequences for alt+=', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 187 }).key).toBe('\x1b=');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 187 }).key).toBe('\x1b+');
    });
    it('should return proper sequences for alt+,', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 188 }).key).toBe('\x1b,');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 188 }).key).toBe('\x1b<');
    });
    it('should return proper sequences for alt+-', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 189 }).key).toBe('\x1b-');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 189 }).key).toBe('\x1b_');
    });
    it('should return proper sequences for alt+.', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 190 }).key).toBe('\x1b.');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 190 }).key).toBe('\x1b>');
    });
    it('should return proper sequences for alt+/', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 191 }).key).toBe('\x1b/');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true, keyCode: 191 }).key).toBe('\x1b?');
    });
    it('should return proper sequences for alt+~', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 192 }).key).toBe('\x1b`');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true, keyCode: 192 }).key).toBe('\x1b~');
    });
    it('should return proper sequences for alt+[', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 219 }).key).toBe('\x1b[');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 219 }).key).toBe('\x1b{');
    });
    it('should return proper sequences for alt+\\', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 220 }).key).toBe('\x1b\\');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 220 }).key).toBe('\x1b|');
    });
    it('should return proper sequences for alt+]', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 221 }).key).toBe('\x1b]');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 221 }).key).toBe('\x1b}');
    });
    it('should return proper sequences for alt+\'', () => {
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 222 }).key).toBe('\x1b\'');
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true,  keyCode: 222 }).key).toBe('\x1b"');
    });

    it('should handle mobile arrow events', () => {
      expect(testEvaluateKeyboardEvent({ keyCode: 0, key: 'UIKeyInputUpArrow' }).key).toBe('\x1b[A');
      expect(testEvaluateKeyboardEvent({ keyCode: 0, key: 'UIKeyInputUpArrow' }, { applicationCursorMode: true }).key).toBe('\x1bOA');
      expect(testEvaluateKeyboardEvent({ keyCode: 0, key: 'UIKeyInputLeftArrow' }).key).toBe('\x1b[D');
      expect(testEvaluateKeyboardEvent({ keyCode: 0, key: 'UIKeyInputLeftArrow' }, { applicationCursorMode: true }).key).toBe('\x1bOD');
      expect(testEvaluateKeyboardEvent({ keyCode: 0, key: 'UIKeyInputRightArrow' }).key).toBe('\x1b[C');
      expect(testEvaluateKeyboardEvent({ keyCode: 0, key: 'UIKeyInputRightArrow' }, { applicationCursorMode: true }).key).toBe('\x1bOC');
      expect(testEvaluateKeyboardEvent({ keyCode: 0, key: 'UIKeyInputDownArrow' }).key).toBe('\x1b[B');
      expect(testEvaluateKeyboardEvent({ keyCode: 0, key: 'UIKeyInputDownArrow' }, { applicationCursorMode: true }).key).toBe('\x1bOB');
    });

    it('should handle lowercase letters', () => {
      expect(testEvaluateKeyboardEvent({ keyCode: 65, key: 'a' }).key).toBe('a');
      expect(testEvaluateKeyboardEvent({ keyCode: 189, key: '-' }).key).toBe('-');
    });

    it('should handle uppercase letters', () => {
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 65, key: 'A' }).key).toBe('A');
      expect(testEvaluateKeyboardEvent({ shiftKey: true, keyCode: 49, key: '!' }).key).toBe('!');
    });

    // Characters using alt+shift sequences (letters)
    it('should return proper sequences for alt+shift+letter combinations', () => {
      // Test alt+shift combinations produce uppercase letters
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true, keyCode: 65 }).key).toBe('\x1bA'); // alt+shift+a
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true, keyCode: 72 }).key).toBe('\x1bH'); // alt+shift+h
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: true, keyCode: 90 }).key).toBe('\x1bZ'); // alt+shift+z

      // Test alt without shift produces lowercase letters
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 65 }).key).toBe('\x1ba'); // alt+a
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 72 }).key).toBe('\x1bh'); // alt+h
      expect(testEvaluateKeyboardEvent({ altKey: true, shiftKey: false, keyCode: 90 }).key).toBe('\x1bz'); // alt+z
    });

    it('should return proper sequence for ctrl+@', () => {
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, shiftKey: true, keyCode: 50, code: 'Digit2', key: '@' }).key).toBe('\x00');
    });

    it('should return proper sequence for ctrl+^', () => {
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, shiftKey: true, keyCode: 54, code: 'Digit6', key: '^' }).key).toBe('\x1e');
    });

    it('should return proper sequence for ctrl+_', () => {
      expect(testEvaluateKeyboardEvent({ ctrlKey: true, shiftKey: true, keyCode: 189, code: 'Minus', key: '_' }).key).toBe('\x1f');
    });

  });
});
