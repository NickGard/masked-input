class MaskedInput extends HTMLInputElement {
  static observedAttributes = [
    "mask-pattern",
    "mask-replacement-character",
    "show-empty-mask",
    "show-overflowed-mask",
    "show-replacement-characters",
    "type",
    "value",
    "pattern",
    "required",
    "maxlength",
    "minlength",
    "step",
    "min",
    "max",
  ];
  // TODO: progressive-reveal="pairwise leading|following"
  // TODO: form validation
  // TODO: test rtl inputs with rtl language
  // TODO: test list attr autocomplete

  #unmaskedValue = "";
  #maskedValue = "";
  #mask = "";
  #maskReplacementCharacter = "_";
  #passwordChar = "•";
  #replacementSlots = 0;
  #valueCharacterCount = 0;
  #characterSlots = [];
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
  #isInternalTypeCalibration = false;

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
      : this.#characterSlots
          .slice(0, this.#valueCharacterCount)
          .map(({ displayChar }) => displayChar)
          .filter(Boolean)
          .join("");
  }
  set maskedValue(v) {
    throw new DOMException("maskedValue is readonly", "NotSupportedError");
  }

  get value() {
    return this.#unmaskedValue;
  }
  set value(value) {
    // stop reflecting the attribute once the value is set programatically
    this.#isValueReflected = false;
    // do not limit the value to maxlength when set programatically
    this.#unmaskedValue = String(value);

    // set validity
    this.#setValidity();

    this.#applyMask();
  }

  get valueAsNumber() {
    return this.#getNativeInput().valueAsNumber;
  }
  set valueAsNumber(value) {
    const nativeInput = this.#getNativeInput();

    // this will throw if an invalid value set or if the input is non-numeric type
    nativeInput.valueAsNumber = value;

    this.#setValue(nativeInput.value);
    this.#applyMask();
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

    this.#internalType = type;

    if (super.type !== "text") {
      super.type = "text";
    }

    // show the correct soft keyboard for the input type
    super.inputMode =
      type === "password" ? "text" : type === "number" ? "decimal" : type;

    this.#setValidity();
  }

  get validity() {
    return this.#getNativeInput().validity;
  }
  set validity(v) {}

  select() {
    this.#trySetSelectionRange(
      this.#characterSlots.at(0)?.start ?? 0,
      this.#getEndPosition(),
      this.selectionDirection
    );
  }

  setRangeText = (
    replacement,
    start = this.selectionStart,
    end = this.selectionEnd,
    selectMode = "preserve"
  ) => {
    if (replacement == null) {
      throw new TypeError(
        "Failed to execute 'setRangeText' on 'HTMLInputElement': 1 argument required, but only 0 present."
      );
    }

    this.#trySetSelectionRange(start, end, this.selectionDirection);
    const { charIndexBeforeSelection } = this.#getSelectionPosition();
    this.#insertText(replacement);

    switch (selectMode) {
      case "select": {
        const newEnd = this.#getPositionOfCharAtIndex(
          (charIndexBeforeSelection || 0) +
            this.#toGraphemes(replacement).length
        )?.end;
        this.#trySetSelectionRange(start, newEnd, this.selectionDirection);
        break;
      }
      case "start": {
        this.#trySetSelectionRange(start, start, this.selectionDirection);
        break;
      }
      case "end": {
        const newEnd = this.#getPositionOfCharAtIndex(
          (charIndexBeforeSelection || 0) +
            this.#toGraphemes(replacement).length
        )?.end;
        this.#trySetSelectionRange(newEnd, newEnd, this.selectionDirection);
        break;
      }
      default: {
        // "preserve" is the default
        this.#trySetSelectionRange(start, end, this.selectionDirection);
        break;
      }
    }
  };

  stepUp = (stepIncrement) => {
    const nativeInput = this.#getNativeInput();
    nativeInput.stepUp(stepIncrement);
    this.#setValue(nativeInput.value);
    this.#applyMask();
  };

  stepDown = (stepIncrement) => {
    const nativeInput = this.#getNativeInput();
    nativeInput.stepDown(stepIncrement);
    this.#setValue(nativeInput.value);
    this.#applyMask();
  };

  checkValidity = () => {
    return this.#getNativeInput().checkValidity();
  };

  getAttribute = (name) => {
    if (name === "type") {
      return this.#internalType;
    } else {
      return this.attributes[name]?.value ?? null;
    }
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

        if (this.#isInternalTypeCalibration) {
          // super.type = "text" triggers a reflow that we should ignore
          this.#isInternalTypeCalibration = false;
          break;
        }

        this.#internalType = newValue;

        if (super.type !== "text") {
          this.#isInternalTypeCalibration = true;
          super.type = "text";
        }

        // show the correct soft keyboard for the input type
        super.inputMode =
          newValue === "password"
            ? "text"
            : newValue === "number"
            ? "decimal"
            : newValue;

        // validate
        this.#setValidity();
        break;
      }

      case "show-empty-mask":
      case "show-overflowed-mask":
      case "show-replacement-characters": {
        this.#applyMask();
        break;
      }

      case "value": {
        if (this.#isValueReflected && newValue !== this.#unmaskedValue) {
          // do not limit the value to maxlength when set programatically
          this.#unmaskedValue = newValue;

          // set validity
          this.#setValidity();

          this.#applyMask();
        }
        break;
      }

      case "pattern":
      case "required":
      case "maxlength":
      case "minlength":
      case "step":
      case "min":
      case "max": {
        this.#setValidity();
      }
    }
  }

  #trySetSelectionRange = (start, end, direction) => {
    try {
      this.setSelectionRange(start, end, direction);
    } catch {}
  };

  #setValidity = () => {
    const nativeInput = this.#getNativeInput();
    const validationMessage = nativeInput.checkValidity()
      ? ""
      : nativeInput.validationMessage;
    this.setCustomValidity(validationMessage);
  };

  #applyMask = () => {
    this.#characterSlots = [];
    const chars = this.#toGraphemes(this.#unmaskedValue ?? "");

    this.#replacementSlots = 0;
    this.#valueCharacterCount = chars.length;

    const usedDisplayChars = [];
    let position = 0;
    let maskedValue = this.#mask.replaceAll(
      this.#maskReplacementCharacter,
      (match, offset) => {
        const char = chars.shift();
        // replace actual char with bullet character
        const displayChar =
          char == null
            ? this.hasAttribute("show-replacement-characters")
              ? match
              : " "
            : this.#internalType === "password"
            ? this.#passwordChar
            : char;
        const charLength = displayChar?.length ?? 1;
        const nextPosition = position + charLength;
        const maskOffset =
          usedDisplayChars.join("").length -
          usedDisplayChars.length * this.#maskReplacementCharacter.length +
          offset;

        this.#characterSlots.push({
          char,
          displayChar,
          position: { start: position, end: nextPosition },
          positionInMask: { start: maskOffset, end: maskOffset + charLength },
        });

        usedDisplayChars.push(displayChar);
        position = nextPosition;
        this.#replacementSlots++;

        return displayChar;
      }
    );

    // add extra characters to end of mask
    let maskEndPosition = maskedValue.length;
    chars.forEach((char) => {
      const displayChar =
        this.#internalType === "password" && char != null ? "•" : char;
      const nextPosition = position + displayChar.length;
      const nextMaskEndPosition = maskEndPosition + displayChar.length;

      this.#characterSlots.push({
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
    const unmaskedDisplayValue = this.#characterSlots
      .map(({ displayChar }) => displayChar)
      .filter(Boolean)
      .join("");

    // grab current selectionDirection
    const currentSelectionDirection = this.selectionDirection;

    // apply mask
    super.value = this.#getMaskVisibility()
      ? this.#maskedValue
      : unmaskedDisplayValue;

    // reapply selection direction since setting the super value removes it
    this.#trySetSelectionRange(
      this.selectionStart,
      this.selectionEnd,
      currentSelectionDirection
    );
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

    this.#characterSlots.forEach(
      ({ char, position, positionInMask }, index) => {
        const { start: charStartPosition, end: charEndPostition } = isMaskShown
          ? positionInMask
          : position;
        if (charEndPostition <= this.selectionStart) {
          charIndexBeforeSelection = index;
        } else if (charStartPosition >= this.selectionEnd) {
          charIndexAfterSelection ??= index;
        } else if (char != null) {
          selectedCharIndexes.push(index);
        }
      }
    );

    return {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
      selectionStart: this.selectionStart,
      selectionEnd: this.selectionEnd,
    };
  };

  #getPositionOfCharAtIndex = (index) => {
    if (index == null || Number.isNaN(index)) {
      return NaN;
    }

    if (this.#characterSlots.length === 0) {
      // no mask and no value chars
      return { start: 0, end: 0 };
    }

    const positionKey = this.#getMaskVisibility()
      ? "positionInMask"
      : "position";
    return this.#characterSlots.at(index)?.[positionKey];
  };

  #getEndPosition = () => {
    if (this.#valueCharacterCount === 0) {
      // no value chars
      return this.#getPositionOfCharAtIndex(0).start;
    } else if (this.#valueCharacterCount >= this.#replacementSlots) {
      // filled OR overfilled the mask
      return this.#getPositionOfCharAtIndex(-1).end;
    } else {
      return this.#getPositionOfCharAtIndex(this.#valueCharacterCount).start;
    }
  };

  #deleteBackward = () => {
    const {
      charIndexBeforeSelection,
      charIndexAfterSelection,
      selectedCharIndexes,
    } = this.#getSelectionPosition();
    const selectionDirection = this.selectionDirection;

    if (charIndexBeforeSelection == null && selectedCharIndexes.length === 0) {
      return;
    }

    const mapper =
      selectedCharIndexes.length > 0
        ? ({ char }, i) => (selectedCharIndexes.includes(i) ? null : char)
        : ({ char }, i) => (i !== charIndexBeforeSelection ? char : null);
    const didChange = this.#setValue(
      this.#characterSlots.map(mapper).filter(Boolean).join("")
    );

    if (!didChange) {
      return;
    }

    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    let nextPosition;
    if (selectedCharIndexes.length > 0) {
      if (selectedCharIndexes.at(0) >= this.#valueCharacterCount) {
        nextPosition = this.#getEndPosition();
      } else {
        nextPosition = this.#getPositionOfCharAtIndex(
          selectedCharIndexes.at(0)
        ).start;
      }
    } else if (
      this.#valueCharacterCount >= this.#replacementSlots &&
      charIndexAfterSelection == null
    ) {
      // at the end of an overflowed mask
      nextPosition = this.#getEndPosition();
    } else {
      nextPosition = this.#getPositionOfCharAtIndex(
        charIndexBeforeSelection
      ).start;
    }

    this.#trySetSelectionRange(nextPosition, nextPosition, selectionDirection);
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
        ? ({ char }, i) => (selectedCharIndexes.includes(i) ? null : char)
        : ({ char }, i) => (i !== charIndexAfterSelection ? char : null);

    const didChange = this.#setValue(
      this.#characterSlots.map(mapper).filter(Boolean).join("")
    );

    if (!didChange) {
      return;
    }

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
    } else if (charIndexAfterSelection > this.#characterSlots.length - 1) {
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

    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  #deleteToBeginning = () => {
    const { charIndexBeforeSelection } = this.#getSelectionPosition();

    if (charIndexBeforeSelection == null) {
      return;
    }

    const mapper = ({ char }, i) =>
      i <= charIndexBeforeSelection ? null : char;

    const didChange = this.#setValue(
      this.#characterSlots.map(mapper).filter(Boolean).join("")
    );

    if (!didChange) {
      return;
    }

    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition = this.#getPositionOfCharAtIndex(0).start;
    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
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

    const mapper = ({ char }, i) => (i < charIndexAfterSelection ? char : null);

    const didChange = this.#setValue(
      this.#characterSlots.map(mapper).filter(Boolean).join("")
    );

    if (!didChange) {
      return;
    }

    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition =
      selectionStart ===
      (charIndexBeforeSelection != null &&
        this.#getPositionOfCharAtIndex(charIndexBeforeSelection).end)
        ? selectionStart
        : this.#getEndPosition();
    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
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

    const unmaskedCursorPosition = this.#characterSlots.at(
      charIndexAfterSelection
    ).position.start;
    const valueStart = this.#unmaskedValue.substring(0, unmaskedCursorPosition);
    const valueEnd = this.#unmaskedValue.substring(unmaskedCursorPosition);
    let nextValueEnd;

    if (Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(this.#getElementLang(), {
        granularity: "word",
      });
      const segments = Array.from(segmenter.segment(valueEnd));
      if (segments.length > 0 && segments[0].isWordLike) {
        nextValueEnd = segments
          .slice(1)
          .map(({ segment }) => segment)
          .join("");
      } else if (
        segments.length > 1 &&
        /^\s+$/u.test(segments.at(0).segment) &&
        segments.at(1).isWordLike
      ) {
        // remove the leading whitespace segment and the word
        nextValueEnd = segments
          .slice(2)
          .map(({ segment }) => segment)
          .join("");
      } else {
        nextValueEnd = valueEnd;
      }
    } else {
      // won't work for graphemes
      nextValueEnd = valueEnd.replace(/^\s*\w+\b/, "");
    }

    const didChange = this.#setValue(valueStart + nextValueEnd);

    if (!didChange) {
      return;
    }

    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition =
      charIndexBeforeSelection != null
        ? this.#getPositionOfCharAtIndex(charIndexBeforeSelection).end
        : this.#getPositionOfCharAtIndex(0).start;

    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  #getElementLang = () => {
    let lang;
    let element = this;
    while (!lang && element) {
      lang = element.lang;
      element = element.parentElement;
    }
    return lang;
  };

  #deleteWordBackward = () => {
    const { charIndexBeforeSelection, selectedCharIndexes } =
      this.#getSelectionPosition();

    if (selectedCharIndexes.length > 0) {
      this.#deleteBackward();
      return;
    }

    if (charIndexBeforeSelection == null) return;

    const unmaskedCursorPosition = this.#characterSlots.at(
      charIndexBeforeSelection
    ).position.end;
    const valueStart = this.#unmaskedValue.substring(0, unmaskedCursorPosition);

    let nextValueStart;

    if (Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(this.#getElementLang(), {
        granularity: "word",
      });
      const segments = Array.from(segmenter.segment(valueStart));
      if (segments.length > 0 && segments.at(-1).isWordLike) {
        nextValueStart = segments
          .slice(0, -1)
          .map(({ segment }) => segment)
          .join("");
      } else if (
        segments.length > 1 &&
        /^\s+$/u.test(segments.at(-1).segment) &&
        segments.at(-2).isWordLike
      ) {
        // remove the trailing whitespace segment and the last word
        nextValueStart = segments
          .slice(0, -2)
          .map(({ segment }) => segment)
          .join("");
      } else {
        nextValueStart = valueStart;
      }
    } else {
      // won't work for graphemes
      nextValueStart = valueStart.replace(/\b\w+\s*$/, "");
    }

    const valueEnd = this.#unmaskedValue.substring(unmaskedCursorPosition);
    const didChange = this.#setValue(nextValueStart + valueEnd);

    if (!didChange) {
      return;
    }

    this.#applyMask();

    const beginningCharCount = this.#toGraphemes(nextValueStart).length;
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

    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  #deleteEntireValue = () => {
    const didChange = this.#setValue("");

    if (!didChange) {
      return;
    }

    this.#applyMask();

    // call #getPositionOfCharAtIndex _after_ applying the mask, in case it changed from masked to unmasked due to unmasked value length
    const nextPosition = this.#getPositionOfCharAtIndex(0).start;
    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
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
        ? this.#characterSlots.at(charIndexBeforeSelection).position.end
        : 0;
    const unmaskedSelectionEnd =
      selectedCharIndexes.length > 0
        ? this.#characterSlots.at(selectedCharIndexes.at(-1)).position.end
        : charIndexAfterSelection != null
        ? this.#characterSlots.at(charIndexAfterSelection).position.start
        : this.#unmaskedValue.length;

    const valueBeginning = this.#unmaskedValue.substring(
      0,
      unmaskedSelectionStart
    );
    const valueEnd = this.#unmaskedValue.substring(unmaskedSelectionEnd);

    const didChange = this.#setValue(valueBeginning + data + valueEnd);

    if (!didChange) {
      return;
    }

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
    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  #insertTranspose = () => {
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
    const firstChar = this.#characterSlots.at(
      atEndOfValue ? charIndexBeforeSelection - 1 : charIndexBeforeSelection
    );
    const secondChar = this.#characterSlots.at(
      atEndOfValue ? charIndexBeforeSelection : charIndexAfterSelection
    );
    const didChange = this.#setValue(
      this.#characterSlots
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

    if (!didChange) {
      return;
    }

    const nextPosition = this.#getPositionOfCharAtIndex(
      this.#characterSlots.indexOf(secondChar)
    ).end;
    this.#applyMask();
    this.#trySetSelectionRange(
      nextPosition,
      nextPosition,
      this.selectionDirection
    );
  };

  /**
   *
   * @param {string} value - the unmasked value to set
   * @returns true if and only if the value has changed
   */
  #setValue = (value) => {
    const prevValue = this.#unmaskedValue;
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

    // set validity
    this.#setValidity();

    return this.#unmaskedValue !== prevValue;
  };

  #getNativeInput = () => {
    const nativeInput = document.createElement("input");
    nativeInput.type = this.#internalType;
    nativeInput.value = this.#unmaskedValue;

    for (const { name, value } of this.attributes) {
      if (
        [
          "type",
          "value",
          "is",
          "class",
          "style",
          "mask-pattern",
          "mask-replacement-character",
          "show-overflowed-mask",
          "show-empty-mask",
          "show-replacement-characters",
        ].includes(name)
      ) {
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
          /apple/i.test(globalThis.navigator?.vendor) &&
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
          this.#trySetSelectionRange(
            originalPosition,
            originalPosition,
            this.selectionDirection
          );
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
    queueMicrotask(() => {
      this.dispatchEvent(
        new InputEvent("input", {
          inputType,
          data,
          isComposing,
          bubbles: true,
          cancelable: false,
        })
      );
    });
  };

  #handleAutofill = (event) => {
    if (
      [undefined, "insertReplacementText"].includes(event.inputType) &&
      event.isTrusted
    ) {
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
      this.#characterSlots
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
    if (this.#internalType === "password") {
      event.preventDefault();
      return;
    }

    event.dataTransfer.clearData();
    const { selectedCharIndexes } = this.#getSelectionPosition();

    event.dataTransfer.setData(
      "text/plain",
      this.#characterSlots
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
            ? Math.min(
                this.#getEndPosition(),
                this.#getPositionOfCharAtIndex(charIndexAfterSelection).end
              )
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
      case "ArrowDown": {
        if (this.#internalType === "number") {
          this.stepDown();
          nextStart = this.#getEndPosition();
          nextEnd = this.#getEndPosition();
          break;
        }
        // else fall through and do the same thing as "End"
      }
      case "End": {
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
      case "ArrowUp": {
        if (this.#internalType === "number") {
          this.stepUp();
          nextStart = this.#getEndPosition();
          nextEnd = this.#getEndPosition();
          break;
        }
        // else fall through and do the same thing as "Home"
      }
      case "Home": {
        const nextPosition = this.#getMaskVisibility()
          ? this.#getPositionOfCharAtIndex(this.#characterSlots.at(0)).start
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

    this.#trySetSelectionRange(nextStart, nextEnd, nextDirection);
  };

  #setSelectionToValidPositions = () => {
    if (this.#replacementSlots === 0) {
      return this.#trySetSelectionRange(0, 0, this.selectionDirection);
    }
    if (this.#valueCharacterCount === 0) {
      const startPosition = this.#getPositionOfCharAtIndex(0).start;
      return this.#trySetSelectionRange(
        startPosition,
        startPosition,
        this.selectionDirection
      );
    }

    // get positions of all non-null characters
    const validPositions = this.#characterSlots
      .slice(0, this.#valueCharacterCount)
      .flatMap((_, idx) => {
        const { start, end } = this.#getPositionOfCharAtIndex(idx);
        return [start, end];
      });

    // if the next slot is a replacement slot that is not filled, get its start position
    if (this.#characterSlots.length > this.#valueCharacterCount) {
      validPositions.push(
        this.#getPositionOfCharAtIndex(this.#valueCharacterCount).start
      );
    }

    const start = validPositions.reduce((prev, curr) =>
      Math.abs(curr - this.selectionStart) <
      Math.abs(prev - this.selectionStart)
        ? curr
        : prev
    );
    const end = validPositions.reduce((prev, curr) =>
      Math.abs(curr - this.selectionEnd) < Math.abs(prev - this.selectionEnd)
        ? curr
        : prev
    );

    this.#trySetSelectionRange(start, end, this.selectionDirection);
  };

  #defaultBehaviors = new Map();
  #setDefaultFor = (name, defaultFn) => {
    const handler = (event) => {
      // wait to run the default function until after the event has finished bubbling
      // in case the author calls preventDefault() later in the bubbling phase
      queueMicrotask(() => {
        if (!event.defaultPrevented) {
          defaultFn(event);
        }
      });
    };
    if (!this.#defaultBehaviors.has(name)) {
      this.addEventListener(name, handler);
      this.#defaultBehaviors.set(name, handler);
    }
  };

  connectedCallback() {
    this.#setDefaultFor("beforeinput", this.#handleInput);
    this.#setDefaultFor("input", this.#handleAutofill);
    this.#setDefaultFor("copy", this.#updateClipboard);
    this.#setDefaultFor("cut", this.#handleCut);
    this.#setDefaultFor("dragstart", this.#handleDragData);
    this.#setDefaultFor("focus", this.#setSelectionToValidPositions);
    this.#setDefaultFor("mouseup", this.#setSelectionToValidPositions);
    this.#setDefaultFor("keydown", this.#handleKeyboardNavigation);
  }

  disconnectedCallback() {
    for (const [name, handler] of this.#defaultBehaviors.entries()) {
      this.removeEventListener(name, handler);
    }
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
 * ✅ 10. handle arrow key and home/end key presses (navigating & selecting)
 * ✅ 11. handle dragging selected text (only have value characters be in dataTransfer, not mask characters)
 * 12. handle RTL inputs
 */
