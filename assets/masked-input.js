class MaskedInput extends HTMLInputElement {
  static observedAttributes = [
    "mask-pattern",
    "mask-replacement-character",
    "show-empty-mask",
    "show-overflowed-mask",
    "show-replacement-characters",
    "type",
    "value",
    "maxlength",
    "minlength",
    "step",
    "min",
    "max",
  ];
  // TODO: progressive-reveal="pairwise leading|following"
  // TODO: form validation
  // TODO: password type
  // TODO: inputmode by type

  #unmaskedValue = "";
  #maskedValue = "";
  #mask = "";
  #maskReplacementCharacter = "_";
  #replacementSlots = 0;
  #valueCharacterCount = 0;
  #valueCharacters = [];
  #isValueReflected = true;
  #maskableTypes = [
    "text",
    "url",
    "search",
    "tel",
    "email",
    "password",
    "number",
  ];
  #internalType = "text";

  get maskReplacementCharacter() {
    return this.#maskReplacementCharacter;
  }
  set maskReplacementCharacter(c) {
    this.#maskReplacementCharacter = String(c);
    this.#applyMask();
  }

  get maskPattern() {
    return this.#mask;
  }
  set maskPattern(mask) {
    this.#mask = String(mask);
    this.#applyMask();
  }

  get maskedValue() {
    return this.#getMaskVisibility()
      ? this.#maskedValue
      : this.#valueCharacters
          .map(({ displayChar }) => displayChar)
          .filter(Boolean)
          .join("");
  }
  set maskedValue(v) {
    throw new Error("maskedValue is readonly");
  }

  get value() {
    return this.#valueCharacters
      .map(({ char }) => char)
      .filter(Boolean)
      .join("");
  }
  set value(value) {
    // stop reflecting the attribute once the value is set programatically
    this.#isValueReflected = false;
    // do not limit the value to maxlength when set programatically
    this.#unmaskedValue = String(value);
    this.#applyMask();
  }

  get valueAsNumber() {
    return this.#getNativeInput().valueAsNumber;
  }
  set valueAsNumber(value) {
    this.#setValue(this.#getNativeInput().valueAsNumber);
  }

  get type() {
    return this.#internalType;
  }
  set type(type) {
    if (!this.#maskableTypes.includes(type)) {
      throw new DOMException(
        `Cannot set type to ${type}. Masked-input type can only be one of [${this.#maskableTypes.join(
          ", "
        )}].`,
        "NotSupportedError"
      );
    }

    if (type !== "text") {
      this.#internalType = type;
      super.type = "text";
    }
    // show the correct soft keyboard for the input type
    super.inputMode =
      type === "password" ? "text" : type === "number" ? "decimal" : type;
  }

  select() {
    this.setSelectionRange(0, this.#getPositionOfCharAtIndex(-1)?.end ?? 0);
  }

  setRangeText = (replacement, start, end, selectMode = "preserve") => {
    const {
      charIndexAfterSelection,
      charIndexBeforeSelection,
      selectedCharIndexes,
      selectionStart,
    } = this.#getSelectionPosition();
    const unmaskedSelectionStart =
      this.#valueCharacters.at(start ?? charIndexBeforeSelection)?.position
        ?.end ?? 0;
    const unmaskedSelectionEnd =
      end != null
        ? this.#valueCharacters.at(end)?.position?.start
        : selectedCharIndexes.length > 0
        ? this.#valueCharacters.at(selectedCharIndexes.at(-1)).position.end
        : charIndexAfterSelection != null
        ? this.#valueCharacters.at(charIndexAfterSelection).position.start
        : this.#unmaskedValue.length;

    this.#setValue(
      this.#getNativeInput().setRangeText(
        replacement,
        unmaskedSelectionStart,
        unmaskedSelectionEnd,
        selectMode
      ).value
    );
  };

  stepUp = (stepIncrement) => {
    return this.#getNativeInput().stepUp(stepIncrement);
  };

  stepDown = (stepIncrement) => {
    return this.#getNativeInput().stepDown(stepIncrement);
  };

  checkValidity = () => {
    return this.#getNativeInput().checkValidity();
  };

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "mask-pattern": {
        this.#mask = newValue;
        this.#applyMask();
        break;
      }

      case "mask-replacement-character": {
        this.#maskReplacementCharacter = newValue;
        this.#applyMask();
        break;
      }

      case "type": {
        if (!this.#maskableTypes.includes(newValue)) {
          throw new DOMException(
            `Cannot set type to ${newValue}. Masked-input type can only be one of [${this.#maskableTypes.join(
              ", "
            )}].`,
            "NotSupportedError"
          );
        }

        if (newValue !== "text") {
          this.#internalType = newValue;
          super.type = "text";
        }
        // show the correct soft keyboard for the input type
        super.inputMode =
          newValue === "password"
            ? "text"
            : newValue === "number"
            ? "decimal"
            : newValue;
        break;
      }

      case "show-empty-mask":
      case "show-overflowed-mask":
      case "show-replacement-characters": {
        this.#applyMask();
        break;
      }

      case "value": {
        const currentValue = this.#valueCharacters
          .map(({ char }) => char)
          .filter(Boolean)
          .join("");
        if (this.#isValueReflected && newValue !== currentValue) {
          // do not limit the value to maxlength when set programatically
          this.#unmaskedValue = newValue;
          this.#applyMask();
        }
        break;
      }
    }
  }

  #applyMask = () => {
    this.#valueCharacters = [];
    const chars = this.#toGraphemes(this.#unmaskedValue ?? "");

    this.#replacementSlots = 0;
    this.#valueCharacterCount = chars.length;

    let position = 0;
    let maskedValue = this.#mask.replaceAll(
      this.#maskReplacementCharacter,
      (match, offset) => {
        const char = chars.shift();
        // replace actual char with bullet character
        const displayChar =
          this.#internalType === "password" && char != null ? "•" : char;
        const charLength = displayChar?.length ?? 1;
        const nextPosition = position + charLength;

        this.#valueCharacters.push({
          char,
          displayChar,
          position: { start: position, end: nextPosition },
          positionInMask: { start: offset, end: offset + charLength },
        });

        position = nextPosition;
        this.#replacementSlots++;

        return (
          displayChar ||
          (this.hasAttribute("show-replacement-characters") ? match : " ")
        );
      }
    );

    // add extra characters to end of mask
    let maskEndPosition = maskedValue.length;
    chars.forEach((char) => {
      const displayChar =
        this.#internalType === "password" && char != null ? "•" : char;
      const nextPosition = position + displayChar.length;
      const nextMaskEndPosition = maskEndPosition + displayChar.length;

      this.#valueCharacters.push({
        char,
        displayChar,
        position: { start: position, end: nextPosition },
        positionInMask: {
          start: maskEndPosition,
          end: nextMaskEndPosition,
        },
      });
      maskedValue += displayChar;

      position = nextPosition;
      maskEndPosition = nextMaskEndPosition;
    });

    this.#maskedValue = maskedValue;
    const unmaskedDisplayValue = this.#valueCharacters
      .map(({ displayChar }) => displayChar)
      .filter(Boolean)
      .join("");

    // apply mask
    super.value = this.#getMaskVisibility()
      ? this.#maskedValue
      : unmaskedDisplayValue;
  };

  #getPlainValue = () => {
    return this.#valueCharacters
      .map(({ displayChar }) => displayChar)
      .filter(Boolean)
      .join("");
  };

  #getMaskVisibility = () => {
    if (this.#valueCharacterCount === 0) {
      return this.hasAttribute("show-empty-mask");
    } else if (this.#valueCharacterCount > this.#replacementSlots) {
      return this.hasAttribute("show-overflowed-mask");
    } else {
      return true;
    }
  };

  #getSelectionPosition = () => {
    const isMaskShown = this.#getMaskVisibility();
    const selectedCharIndexes = [];
    let charIndexBeforeSelection;
    let charIndexAfterSelection;

    this.#valueCharacters.forEach(({ position, positionInMask }, index) => {
      const { start: charStartPosition, end: charEndPostition } = isMaskShown
        ? positionInMask
        : position;
      if (charEndPostition <= this.selectionStart) {
        charIndexBeforeSelection = index;
      } else if (charStartPosition >= this.selectionEnd) {
        charIndexAfterSelection ??= index;
      } else {
        selectedCharIndexes.push(index);
      }
    });

    return {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
      selectionStart: this.selectionStart,
      selectionEnd: this.selectionEnd,
    };
  };

  #getPositionOfCharAtIndex = (index) => {
    const positionKey = this.#getMaskVisibility()
      ? "positionInMask"
      : "position";
    return this.#valueCharacters.at(index)?.[positionKey];
  };

  #getEndPosition = () => {
    const firstEmptySlot = this.#valueCharacters.find(
      ({ char }) => char == null
    );
    return firstEmptySlot
      ? this.#getPositionOfCharAtIndex(
          this.#valueCharacters.indexOf(firstEmptySlot)
        ).start
      : this.#getPositionOfCharAtIndex(-1).end;
  };

  #deleteBackward = () => {
    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
    } = this.#getSelectionPosition();

    if (charIndexBeforeSelection == null && selectedCharIndexes.length === 0) {
      return;
    }

    const mapper =
      selectedCharIndexes.length > 0
        ? ({ displayChar }, i) =>
            selectedCharIndexes.includes(i) ? null : displayChar
        : ({ displayChar }, i) =>
            i !== charIndexBeforeSelection ? displayChar : null;

    this.#setValue(this.#valueCharacters.map(mapper).filter(Boolean).join(""));
    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    let nextPosition;
    if (selectedCharIndexes.length > 0) {
      nextPosition = this.#getPositionOfCharAtIndex(
        selectedCharIndexes.at(0)
      ).start;
    } else if (
      this.#valueCharacters.length >= this.#replacementSlots &&
      charIndexAfterSelection == null
    ) {
      // at the end of an overflowed mask
      nextPosition = this.#getPositionOfCharAtIndex(
        charIndexBeforeSelection - 1
      ).end;
    } else {
      nextPosition = this.#getPositionOfCharAtIndex(
        charIndexBeforeSelection
      ).start;
    }

    this.setSelectionRange(nextPosition, nextPosition);
  };

  #deleteForward = () => {
    const {
      charIndexBeforeSelection,
      selectedCharIndexes,
      charIndexAfterSelection,
      selectionStart,
      selectionEnd,
    } = this.#getSelectionPosition();

    if (charIndexAfterSelection == null && selectedCharIndexes.length === 0) {
      return;
    }

    const mapper =
      selectedCharIndexes.length > 0
        ? ({ displayChar }, i) =>
            selectedCharIndexes.includes(i) ? null : displayChar
        : ({ displayChar }, i) =>
            i !== charIndexAfterSelection ? displayChar : null;

    this.#setValue(this.#valueCharacters.map(mapper).filter(Boolean).join(""));
    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    let nextPosition;
    if (selectedCharIndexes.length > 0) {
      nextPosition =
        selectionStart ===
        this.#getPositionOfCharAtIndex(charIndexBeforeSelection).end
          ? selectionStart
          : this.#getPositionOfCharAtIndex(selectedCharIndexes.at(0)).start;
    } else if (charIndexBeforeSelection == null) {
      nextPosition = this.#getPositionOfCharAtIndex(0).start;
    } else if (charIndexAfterSelection > this.#valueCharacters.length - 1) {
      nextPosition = this.#getPositionOfCharAtIndex(
        charIndexBeforeSelection
      ).end;
    } else {
      const startOfEnd = this.#getPositionOfCharAtIndex(
        charIndexAfterSelection
      ).start;
      const endOfStart = this.#getPositionOfCharAtIndex(
        charIndexBeforeSelection
      ).end;
      nextPosition =
        endOfStart === this.selectionStart ? endOfStart : startOfEnd;
    }

    this.setSelectionRange(nextPosition, nextPosition);
  };

  #deleteToBeginning = () => {
    const { charIndexBeforeSelection } = this.#getSelectionPosition();

    if (charIndexBeforeSelection == null) {
      return;
    }

    const mapper = ({ displayChar }, i) =>
      i <= charIndexBeforeSelection ? null : displayChar;

    this.#setValue(this.#valueCharacters.map(mapper).filter(Boolean).join(""));
    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition = this.#getPositionOfCharAtIndex(0).start;
    this.setSelectionRange(nextPosition, nextPosition);
  };

  #deleteToEnd = () => {
    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectionStart,
    } = this.#getSelectionPosition();

    if (charIndexAfterSelection == null) {
      return;
    }

    const mapper = ({ displayChar }, i) =>
      i < charIndexAfterSelection ? displayChar : null;

    this.#setValue(this.#valueCharacters.map(mapper).filter(Boolean).join(""));
    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition =
      selectionStart ===
      this.#getPositionOfCharAtIndex(charIndexBeforeSelection).end
        ? selectionStart
        : this.#getEndPosition();
    this.setSelectionRange(nextPosition, nextPosition);
  };

  #deleteWordForward = () => {
    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
    } = this.#getSelectionPosition();

    if (selectedCharIndexes.length > 0) {
      this.#deleteForward();
      return;
    }

    if (charIndexAfterSelection == null) return;

    const unmaskedCursorPosition = this.#valueCharacters.at(
      charIndexAfterSelection
    ).position.start;
    const plainValue = this.#getPlainValue();
    const valueBeginning = plainValue.substring(0, unmaskedCursorPosition);
    const valueEnd = plainValue.substring(unmaskedCursorPosition);

    this.#setValue(valueBeginning + valueEnd.replace(/^\s*\w+\b/, ""));
    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition =
      charIndexBeforeSelection != null
        ? this.#getPositionOfCharAtIndex(charIndexBeforeSelection).end
        : this.#getPositionOfCharAtIndex(0).start;

    this.setSelectionRange(nextPosition, nextPosition);
  };

  #deleteWordBackward = () => {
    const { charIndexBeforeSelection, selectedCharIndexes } =
      this.#getSelectionPosition();

    if (selectedCharIndexes.length > 0) {
      this.#deleteBackward();
      return;
    }

    if (charIndexBeforeSelection == null) return;

    const unmaskedCursorPosition = this.#valueCharacters.at(
      charIndexBeforeSelection
    ).position.end;
    const plainValue = this.#getPlainValue();
    const valueBeginning = plainValue
      .substring(0, unmaskedCursorPosition)
      .replace(/\b\w+\s*$/, "");
    const valueEnd = plainValue.substring(unmaskedCursorPosition);

    this.#setValue(valueBeginning + valueEnd);
    this.#applyMask();

    const beginningCharCount = this.#toGraphemes(valueBeginning).length;
    const endCharCount = this.#toGraphemes(valueEnd).length;

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    let nextPosition;
    if (beginningCharCount === 0) {
      nextPosition = this.#getPositionOfCharAtIndex(0).start;
    } else if (beginningCharCount + endCharCount < this.#replacementSlots) {
      nextPosition = this.#getPositionOfCharAtIndex(beginningCharCount).start;
    } else {
      nextPosition = this.#getPositionOfCharAtIndex(beginningCharCount - 1).end;
    }

    this.setSelectionRange(nextPosition, nextPosition);
  };

  #deleteEntireValue = () => {
    this.#setValue("");
    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition = this.#getPositionOfCharAtIndex(0).start;
    this.setSelectionRange(nextPosition, nextPosition);
  };

  #insertText = (data) => {
    const {
      charIndexAfterSelection,
      charIndexBeforeSelection,
      selectedCharIndexes,
      selectionStart,
    } = this.#getSelectionPosition();
    const insertedTextLength = this.#toGraphemes(data).length;
    const unmaskedSelectionStart =
      charIndexBeforeSelection != null
        ? this.#valueCharacters.at(charIndexBeforeSelection).position.end
        : 0;
    const unmaskedSelectionEnd =
      selectedCharIndexes.length > 0
        ? this.#valueCharacters.at(selectedCharIndexes.at(-1)).position.end
        : charIndexAfterSelection != null
        ? this.#valueCharacters.at(charIndexAfterSelection).position.start
        : this.#unmaskedValue.length;

    const valueBeginning = this.#getPlainValue().substring(
      0,
      unmaskedSelectionStart
    );
    const valueEnd = this.#getPlainValue().substring(unmaskedSelectionEnd);

    this.#setValue(valueBeginning + data + valueEnd);

    this.#applyMask();

    let nextPosition;
    if (charIndexAfterSelection == null) {
      nextPosition = this.#getEndPosition();
    } else if (charIndexBeforeSelection == null) {
      nextPosition =
        insertedTextLength === this.#valueCharacterCount
          ? this.#getEndPosition()
          : this.#getPositionOfCharAtIndex(insertedTextLength).start;
    } else {
      nextPosition =
        this.#getPositionOfCharAtIndex(charIndexBeforeSelection).end ===
        selectionStart
          ? this.#getPositionOfCharAtIndex(
              charIndexBeforeSelection + insertedTextLength
            ).end
          : this.#getPositionOfCharAtIndex(
              charIndexBeforeSelection + insertedTextLength + 1
            ).start;
    }
    this.setSelectionRange(nextPosition, nextPosition);
  };

  #insertTranspose = (data) => {
    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
    } = this.#getSelectionPosition();
    const atEndOfValue = charIndexAfterSelection == null;

    if (
      charIndexBeforeSelection == null ||
      (atEndOfValue && charIndexBeforeSelection === 0)
    ) {
      // at beginning of value, or at end of single char value
      return;
    }
    const firstChar = this.#valueCharacters.at(
      atEndOfValue ? charIndexBeforeSelection - 1 : charIndexBeforeSelection
    );
    const secondChar = this.#valueCharacters.at(
      atEndOfValue ? charIndexBeforeSelection : charIndexAfterSelection
    );
    this.#setValue(
      this.#valueCharacters
        .map((valueChar) => {
          if (valueChar === firstChar) {
            return secondChar.char;
          } else if (valueChar === secondChar) {
            return firstChar.char;
          } else {
            return valueChar.char;
          }
        })
        .join("")
    );
    const nextPosition = this.#getPositionOfCharAtIndex(
      this.#valueCharacters.indexOf(secondChar)
    ).end;
    this.#applyMask();
    this.setSelectionRange(nextPosition, nextPosition);
  };

  #setValue = (value) => {
    const maxLength = parseInt(this.maxLength, 10);
    if (typeof value !== "string") {
      this.#unmaskedValue = "";
    } else if (this.#internalType === "number") {
      const nativeNumberInput = this.#getNativeInput();
      nativeNumberInput.value = value; // coercion and validation will happen here
      this.#unmaskedValue = nativeNumberInput.value;
    } else if (!Number.isNaN(maxLength) && maxLength >= 0) {
      this.#unmaskedValue = value.substring(0, maxLength);
    } else {
      this.#unmaskedValue = value;
    }
  };

  #getNativeInput = () => {
    const nativeInput = document.createElement("input");
    nativeInput.type = this.#internalType;
    nativeInput.value = this.#unmaskedValue;

    for (const { name, value } of this.attributes) {
      if (["type", "value", "is"].includes(name)) {
        continue;
      }
      nativeInput.setAttribute(name, value);
    }
    return nativeInput;
  };

  // Not all characters have a length of 1, so split the string on unicode graphemes
  // to preserve multi-byte characters
  #toGraphemes = (string) => {
    if (typeof string !== "string") return [];

    try {
      const segmenter = new Intl.Segmenter();
      return Array.from(segmenter.segment(string)).map(
        ({ segment }) => segment
      );
    } catch {
      // this won't work for grapheme clusters like flags or skin-tone emoji, but it's better than nothing
      const graphemes = [];
      string.replaceAll(/\p{Any}/gu, (grapheme) => {
        graphemes.push(grapheme);
      });
      return graphemes;
    }
  };

  #handleInput = (event) => {
    const { inputType, data, isComposing } = event;

    if (
      this.#internalType !== "number" &&
      parseInt(this.maxLength, 10) >= 0 &&
      this.#unmaskedValue >= parseInt(this.maxLength, 10)
    ) {
      event.preventDefault();
      // do not process beforeinput event and do not dispatch input event
      return;
    }

    // stop reflecting the attribute once an input has occurred
    this.#isValueReflected = false;

    switch (inputType) {
      case "insertReplacementText": // autocomplete, spellcheck, auto-suggest, etc.
      case "insertFromYank": // ctrl+y on MacOS
      case "insertFromDrop": // drag-and-drop events
      case "insertFromPaste":
      case "insertFromPasteAsQuotation":
      case "insertCompositionText":
      case "insertText": {
        event.preventDefault();
        if (
          /apple/i.test(navigator.vendor) &&
          inputType === "insertText" &&
          this.selectionStart !== this.selectionEnd &&
          this.#toGraphemes(data).length === 2
        ) {
          // this is actually a transposition in Safari
          // insertTranspose expects a cursor, not a selection, so find an appropriate position and set the selection range
          const { selectedCharIndexes } = this.#getSelectionPosition();
          const originalPosition = this.#getPositionOfCharAtIndex(
            selectedCharIndexes.at(0)
          ).end;
          this.setSelectionRange(originalPosition, originalPosition);
          this.#insertTranspose(data);
        } else {
          this.#insertText(data);
        }
        break;
      }
      case "insertTranspose": {
        event.preventDefault();
        // Safari dispatches an "insertText" event with the transposed characters and the selected range
        // Firefox doesn't support transposition
        // Chrome works as expected
        // ctrl+t on MacOS
        this.#insertTranspose(data);
        break;
      }
      case "deleteWordBackward": {
        event.preventDefault();
        // opt+delete on MacOS
        this.#deleteWordBackward();
        break;
      }
      case "deleteWordForward": {
        event.preventDefault();
        this.#deleteWordForward();
        break;
      }
      case "deleteEntireSoftLine": {
        event.preventDefault();
        this.#deleteEntireValue();
        break;
      }
      case "deleteSoftLineBackward":
      case "deleteHardLineBackward": {
        event.preventDefault();
        this.#deleteToBeginning();
        break;
      }
      case "deleteSoftLineForward":
      case "deleteHardLineForward": {
        event.preventDefault();
        // ctrl+k on MacOS
        this.#deleteToEnd();
        break;
      }
      case "deleteByDrag":
      case "deleteByCut":
      case "deleteContent":
      case "deleteContentBackward": {
        event.preventDefault();
        // delete key
        this.#deleteBackward();
        break;
      }
      case "deleteContentForward": {
        event.preventDefault();
        this.#deleteForward();
        break;
      }
      default: {
        // ignore formatting and history input events
        return;
      }
    }

    // dispatch InputEvent for other listeners, since preventDefault stopped the native dispatch
    setTimeout(() => {
      this.dispatchEvent(
        new InputEvent("input", { inputType, data, isComposing })
      );
    }, 0);
  };

  #handleAutofill = (event) => {
    // ignore history input events (undo/redo)
    if (!/^history[A-Z]/.test(event.inputType) && event.isTrusted) {
      this.#setValue(super.value);
      this.#applyMask();
    }
  };

  #updateClipboard = (event) => {
    event.preventDefault();
    if (this.#internalType === "password") {
      // password inputs disallow copying
      return;
    }
    const { selectedCharIndexes } = this.#getSelectionPosition();

    event.clipboardData.setData(
      "text/plain",
      this.#valueCharacters
        .filter((_, idx) => selectedCharIndexes.includes(idx))
        .map(({ displayChar }) => displayChar)
        .join("")
    );
  };

  #handleCut = (event) => {
    this.#updateClipboard(event);
    this.#deleteBackward();
  };

  #handleDragData = (event) => {
    event.dataTransfer.clearData();
    const { selectedCharIndexes } = this.#getSelectionPosition();

    event.dataTransfer.setData(
      "text/plain",
      this.#valueCharacters
        .filter((_, idx) => selectedCharIndexes.includes(idx))
        .map(({ displayChar }) => displayChar)
        .join("")
    );
  };

  #handleKeyboardNavigation = (event) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      return;
    }
    event.preventDefault();

    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
    } = this.#getSelectionPosition();

    let nextStart;
    let nextEnd;
    let nextDirection;

    switch (event.key) {
      case "ArrowRight": {
        let nextCharEnd =
          charIndexAfterSelection != null
            ? this.#getPositionOfCharAtIndex(charIndexAfterSelection).end
            : null;

        if (this.selectionStart !== this.selectionEnd) {
          // text already selected
          if (event.shiftKey) {
            // continue selection
            if (this.selectionDirection === "forward") {
              nextDirection = "forward";
              nextStart = this.selectionStart;
              nextEnd = nextCharEnd ?? this.selectionEnd;
            } else {
              // backward
              nextCharEnd =
                selectedCharIndexes.length > 0
                  ? this.#getPositionOfCharAtIndex(selectedCharIndexes.at(0))
                      .end
                  : nextCharEnd ?? this.selectionEnd;
              nextDirection =
                nextCharEnd > this.selectionEnd
                  ? "forward"
                  : nextCharEnd === this.selectionEnd
                  ? "none"
                  : "backward";
              nextStart =
                nextDirection === "backward" ? nextCharEnd : this.selectionEnd;
              nextEnd =
                nextDirection === "forward" ? nextCharEnd : this.selectionEnd;
            }
          } else {
            // remove selection, set cursor to selection end
            nextDirection = "none";
            nextStart = this.selectionEnd;
            nextEnd = this.selectionEnd;
          }
        } else {
          // no text selected
          nextDirection = "none";
          nextStart =
            nextCharEnd == null || event.shiftKey
              ? this.selectionStart
              : nextCharEnd;
          nextEnd = nextCharEnd ?? this.selectionEnd;
        }
        break;
      }
      case "ArrowLeft": {
        let prevCharStart =
          charIndexBeforeSelection != null
            ? this.#getPositionOfCharAtIndex(charIndexBeforeSelection).start
            : null;

        if (this.selectionStart !== this.selectionEnd) {
          // text already selected
          if (event.shiftKey) {
            // continue selection
            if (this.selectionDirection === "backward") {
              nextDirection = "backward";
              nextStart = this.selectionStart;
              nextEnd = prevCharStart ?? this.selectionEnd;
            } else {
              // forward
              prevCharStart =
                selectedCharIndexes.length > 0
                  ? this.#getPositionOfCharAtIndex(selectedCharIndexes.at(-1))
                      .start
                  : prevCharStart ?? this.selectionStart;
              nextDirection =
                prevCharStart > this.selectionStart
                  ? "forward"
                  : prevCharStart === this.selectionStart
                  ? "none"
                  : "backward";
              nextStart =
                nextDirection === "backward"
                  ? prevCharStart
                  : this.selectionStart;
              nextEnd =
                nextDirection === "forward"
                  ? prevCharStart
                  : this.selectionStart;
            }
          } else {
            // remove selection, set cursor to selection start
            nextDirection = "none";
            nextStart = this.selectionStart;
            nextEnd = this.selectionStart;
          }
        } else {
          // no text selected
          nextDirection = "none";
          nextStart = prevCharStart ?? this.selectionStart;
          nextEnd =
            prevCharStart == null || event.shiftKey
              ? this.selectionEnd
              : prevCharStart;
        }
        break;
      }
      case "End":
      case "ArrowDown": {
        nextEnd = this.#getEndPosition();

        if (event.shiftKey) {
          // change selection
          if (this.selectionDirection === "backward") {
            nextStart = this.selectionEnd;
          } else {
            // selectionDirection is either "forward" or "none"
            nextStart = this.selectionStart;
          }
        } else {
          // non-selecting
          nextStart = this.#getEndPosition();
        }

        nextDirection = nextStart === nextEnd ? "none" : "forward";
        break;
      }
      case "Home":
      case "ArrowUp": {
        const nextPosition = this.#getMaskVisibility()
          ? this.#getPositionOfCharAtIndex(this.#valueCharacters.at(0)).start
          : 0;
        nextStart = nextPosition;

        if (event.shiftKey) {
          // change selection
          if (this.selectionDirection === "backward") {
            nextEnd = this.selectionEnd;
          } else {
            // selectionDirection is either "forward" or "none"
            nextEnd = this.selectionStart;
          }
        } else {
          // non-selecting
          nextEnd = nextPosition;
        }

        nextDirection = nextStart === nextEnd ? "none" : "backward";
        break;
      }
    }

    this.setSelectionRange(nextStart, nextEnd, nextDirection);
  };

  #getNearestValueEdge = () => {
    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
    } = this.#getSelectionPosition();

    if (selectedCharIndexes.length > 0) {
      return this.selectionDirection === "backward"
        ? this.#getPositionOfCharAtIndex(selectedCharIndexes.at(0)).start
        : this.#getPositionOfCharAtIndex(selectedCharIndexes.at(-1)).end;
    } else if (
      charIndexBeforeSelection != null &&
      charIndexAfterSelection != null
    ) {
      const leadingEdge = this.#getPositionOfCharAtIndex(
        charIndexBeforeSelection
      ).end;
      const trailingEdge = this.#getPositionOfCharAtIndex(
        charIndexAfterSelection
      ).start;
      return this.selectionStart - leadingEdge >
        trailingEdge - this.selectionEnd
        ? trailingEdge
        : leadingEdge;
    } else if (charIndexBeforeSelection == null) {
      return this.#getPositionOfCharAtIndex(charIndexAfterSelection).start;
    } else if (charIndexAfterSelection == null) {
      return this.#getPositionOfCharAtIndex(charIndexBeforeSelection).end;
    }
  };

  #setCursorToNearestValueEdge = () => {
    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
    } = this.#getSelectionPosition();

    // ignore selections; do not "shrink-wrap" selections after the user has made them
    if (selectedCharIndexes.length === 0) {
      const nextPosition = this.#getNearestValueEdge();
      this.setSelectionRange(
        nextPosition,
        nextPosition,
        this.selectionDirection
      );
    }
  };

  connectedCallback() {
    this.addEventListener("beforeinput", this.#handleInput);
    this.addEventListener("input", this.#handleAutofill);
    this.addEventListener("copy", this.#updateClipboard);
    this.addEventListener("cut", this.#handleCut);
    this.addEventListener("dragstart", this.#handleDragData);
    this.addEventListener("focus", this.#setCursorToNearestValueEdge);
    this.addEventListener("mouseup", this.#setCursorToNearestValueEdge);
    this.addEventListener("keydown", this.#handleKeyboardNavigation);
  }

  disconnectedCallback() {
    this.removeEventListener("beforeinput", this.#handleInput);
    this.removeEventListener("input", this.#handleAutofill);
    this.removeEventListener("copy", this.#updateClipboard);
    this.removeEventListener("cut", this.#handleCut);
    this.removeEventListener("dragstart", this.#handleDragData);
    this.removeEventListener("focus", this.#setCursorToNearestValueEdge);
    this.removeEventListener("mouseup", this.#setCursorToNearestValueEdge);
    this.removeEventListener("keydown", this.#handleKeyboardNavigation);
  }
}

customElements.define("masked-input", MaskedInput, { extends: "input" });

/**
 * TODO:
 * ✅ 1. handle autofill input events (beforeinput is not dispatched for those)
 * 🔳 2. figure out way to declare multiple masks
 *   a. use datalist element and pattern-list attribute to IDREF it
 * ❌ 3. handle imperative formatting
 *   a. add a format-value attribute and property
 *   -- don't add imperative formatting because we would have no way of knowing what's value and what's mask
 * ✅ 4. add options for handling: (hide extra chars, hide mask)
 *   a. no characters (show empty mask)
 *   b. not enough characters for mask (progressive reveal, show replacement characters)
 *   c. too many characters for mask (show overflowed mask) -- DO NOT HIDE EXTRA CHARS; inputs should default
 *      to showing the entire value for a11y. Authors can use maxlength to limit chars to mask size
 * 🔳 5. handle form validation
 * 🔳 6. handle pattern attr
 * 🔳 7. handle min/max length attr
 * 🔳 8. handle number/tel/email/url types
 * ✅ 9. handle copy/cut events
 * 🔳 10. handle arrow key and home/end key presses (navigating & selecting)
 * 11. handle dragging selected text (only have value characters be in dataTransfer, not mask characters)
 * 12. handle RTL inputs
 */
