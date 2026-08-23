// Global Wallet Check calculator utility. This module has no finance or persistence dependencies.
(function () {
  "use strict";

  const OPERATORS = {
    "+": { precedence: 1, calculate: (left, right) => left + right },
    "-": { precedence: 1, calculate: (left, right) => left - right },
    "*": { precedence: 2, calculate: (left, right) => left * right },
    "/": {
      precedence: 2,
      calculate: (left, right) => {
        if (right === 0) throw new Error("Cannot divide by zero");
        return left / right;
      },
    },
  };

  const OPERATOR_LABELS = { "+": "+", "-": "−", "*": "×", "/": "÷" };
  const MAX_INPUT_DIGITS = 15;

  class CalculatorEngine {
    constructor() {
      this.clear();
    }

    clear() {
      this.tokens = [];
      this.input = "0";
      this.overwriteInput = true;
      this.justEvaluated = false;
      this.error = false;
      this.expression = "";
    }

    inputDigit(digit) {
      if (this.error || this.justEvaluated) this.clear();
      if (this.input.replace(/\D/g, "").length >= MAX_INPUT_DIGITS && !this.overwriteInput) return;

      if (this.overwriteInput) {
        this.input = digit;
        this.overwriteInput = false;
      } else if (this.input === "0") {
        this.input = digit;
      } else if (this.input === "-0") {
        this.input = `-${digit}`;
      } else {
        this.input += digit;
      }
      this.expression = this.expressionForDisplay();
    }

    inputDecimal() {
      if (this.error || this.justEvaluated) this.clear();
      if (this.overwriteInput) {
        this.input = "0.";
        this.overwriteInput = false;
      } else if (!this.input.includes(".")) {
        this.input += ".";
      }
      this.expression = this.expressionForDisplay();
    }

    inputOperator(operator) {
      if (this.error || !OPERATORS[operator]) return;

      if (this.justEvaluated) {
        this.tokens = [Number(this.input)];
        this.justEvaluated = false;
      } else if (!this.overwriteInput || this.tokens.length === 0) {
        this.tokens.push(Number(this.input));
      }

      if (typeof this.tokens[this.tokens.length - 1] === "string") {
        this.tokens[this.tokens.length - 1] = operator;
      } else {
        this.tokens.push(operator);
      }

      this.overwriteInput = true;
      this.expression = this.expressionForDisplay();
    }

    toggleSign() {
      if (this.error) return;
      if (this.justEvaluated) this.justEvaluated = false;
      if (this.input === "0") return;
      this.input = this.input.startsWith("-") ? this.input.slice(1) : `-${this.input}`;
      this.overwriteInput = false;
      this.expression = this.expressionForDisplay();
    }

    percentage() {
      if (this.error) return;
      const value = Number(this.input) / 100;
      if (!Number.isFinite(value)) return this.setError();
      this.input = String(value);
      this.overwriteInput = false;
      this.justEvaluated = false;
      this.expression = this.expressionForDisplay();
    }

    backspace() {
      if (this.error) return this.clear();
      if (this.overwriteInput || this.justEvaluated) return;
      this.input = this.input.length > 1 ? this.input.slice(0, -1) : "0";
      if (this.input === "-" || this.input === "") this.input = "0";
      this.expression = this.expressionForDisplay();
    }

    equals() {
      if (this.error) return;
      const expressionTokens = this.tokens.slice();

      if (expressionTokens.length === 0) {
        this.justEvaluated = true;
        this.overwriteInput = true;
        return;
      }

      // Using the visible value as the final operand also makes "2 + =" behave as 2 + 2.
      expressionTokens.push(Number(this.input));
      const completedExpression = this.tokensToDisplay(expressionTokens);

      try {
        const result = this.evaluate(expressionTokens);
        if (!Number.isFinite(result)) throw new Error("Result is not finite");
        this.input = String(Object.is(result, -0) ? 0 : result);
        this.tokens = [];
        this.overwriteInput = true;
        this.justEvaluated = true;
        this.expression = `${completedExpression} =`;
      } catch (_error) {
        this.setError();
      }
    }

    evaluate(tokens) {
      const values = [];
      const operators = [];

      const applyTopOperator = () => {
        const operator = operators.pop();
        const right = values.pop();
        const left = values.pop();
        if (left === undefined || right === undefined) throw new Error("Incomplete expression");
        values.push(OPERATORS[operator].calculate(left, right));
      };

      tokens.forEach((token) => {
        if (typeof token === "number") {
          values.push(token);
          return;
        }
        while (
          operators.length &&
          OPERATORS[operators[operators.length - 1]].precedence >= OPERATORS[token].precedence
        ) {
          applyTopOperator();
        }
        operators.push(token);
      });

      while (operators.length) applyTopOperator();
      if (values.length !== 1) throw new Error("Invalid expression");
      return values[0];
    }

    setError() {
      this.tokens = [];
      this.input = "Error";
      this.expression = "Cannot complete this calculation";
      this.overwriteInput = true;
      this.justEvaluated = false;
      this.error = true;
    }

    expressionForDisplay() {
      const parts = this.tokens.slice();
      if (!this.overwriteInput) parts.push(Number(this.input));
      return this.tokensToDisplay(parts);
    }

    tokensToDisplay(tokens) {
      return tokens
        .map((token) => (typeof token === "string" ? OPERATOR_LABELS[token] : this.formatNumber(token)))
        .join(" ");
    }

    formatInput() {
      if (this.error) return "Error";
      if (this.justEvaluated) return this.formatNumber(Number(this.input));

      const negative = this.input.startsWith("-");
      const unsigned = negative ? this.input.slice(1) : this.input;
      const [integer, decimal] = unsigned.split(".");
      const groupedInteger = (integer || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return `${negative ? "−" : ""}${groupedInteger}${decimal !== undefined ? `.${decimal}` : ""}`;
    }

    formatNumber(value) {
      if (!Number.isFinite(value)) return "Error";
      const absolute = Math.abs(value);
      if (absolute >= 1e15 || (absolute > 0 && absolute < 1e-9)) {
        return value.toExponential(10).replace(/\.?(0+)(?=e)/, "");
      }
      return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 12,
        maximumSignificantDigits: 12,
        useGrouping: true,
      }).format(value);
    }
  }

  function calculatorMarkup() {
    return `
      <div class="calculator-layer" id="walletCalculatorLayer" hidden>
        <div class="calculator-backdrop" data-calculator-close aria-hidden="true"></div>
        <section class="calculator-panel" id="walletCalculator" role="dialog" aria-modal="true" aria-labelledby="walletCalculatorTitle" tabindex="-1">
          <div class="calculator-heading">
            <h2 id="walletCalculatorTitle">Calculator</h2>
            <div class="calculator-heading-actions">
              <button class="calculator-icon-button" type="button" data-calculator-action="backspace" aria-label="Delete last digit" title="Delete last digit"><i class="bi bi-backspace"></i></button>
              <button class="calculator-icon-button" type="button" data-calculator-close aria-label="Close calculator" title="Close calculator"><i class="bi bi-x-lg"></i></button>
            </div>
          </div>
          <div class="calculator-display" aria-live="polite" aria-atomic="true">
            <div class="calculator-expression" data-calculator-expression>&nbsp;</div>
            <output class="calculator-output" data-calculator-output>0</output>
          </div>
          <div class="calculator-keypad" aria-label="Calculator keypad">
            <button type="button" class="calculator-key calculator-key--utility" data-calculator-action="clear">AC</button>
            <button type="button" class="calculator-key calculator-key--utility" data-calculator-action="sign" aria-label="Toggle positive or negative">±</button>
            <button type="button" class="calculator-key calculator-key--utility" data-calculator-action="percent" aria-label="Percentage">%</button>
            <button type="button" class="calculator-key calculator-key--operator" data-calculator-operator="/" aria-label="Divide">÷</button>
            <button type="button" class="calculator-key" data-calculator-digit="7">7</button>
            <button type="button" class="calculator-key" data-calculator-digit="8">8</button>
            <button type="button" class="calculator-key" data-calculator-digit="9">9</button>
            <button type="button" class="calculator-key calculator-key--operator" data-calculator-operator="*" aria-label="Multiply">×</button>
            <button type="button" class="calculator-key" data-calculator-digit="4">4</button>
            <button type="button" class="calculator-key" data-calculator-digit="5">5</button>
            <button type="button" class="calculator-key" data-calculator-digit="6">6</button>
            <button type="button" class="calculator-key calculator-key--operator" data-calculator-operator="-" aria-label="Subtract">−</button>
            <button type="button" class="calculator-key" data-calculator-digit="1">1</button>
            <button type="button" class="calculator-key" data-calculator-digit="2">2</button>
            <button type="button" class="calculator-key" data-calculator-digit="3">3</button>
            <button type="button" class="calculator-key calculator-key--operator" data-calculator-operator="+" aria-label="Add">+</button>
            <button type="button" class="calculator-key calculator-key--zero" data-calculator-digit="0">0</button>
            <button type="button" class="calculator-key" data-calculator-action="decimal" aria-label="Decimal point">.</button>
            <button type="button" class="calculator-key calculator-key--equals" data-calculator-action="equals" aria-label="Equals">=</button>
          </div>
        </section>
      </div>`;
  }

  function setupCalculator() {
    const headerActions = document.querySelector(".top-header .app-shell");
    if (!headerActions || document.getElementById("walletCalculatorToggle")) return;

    const themeToggle = document.createElement("button");
    themeToggle.className = "header-action header-utility-action header-theme-toggle";
    themeToggle.type = "button";
    themeToggle.title = "Toggle dark/light mode";
    themeToggle.setAttribute("aria-label", "Toggle color theme");
    themeToggle.setAttribute("data-theme-toggle", "");
    themeToggle.innerHTML = '<i class="bi bi-moon-stars" data-theme-icon aria-hidden="true"></i><span class="visually-hidden" data-theme-label>Dark mode</span>';

    const trigger = document.createElement("button");
    trigger.className = "header-action header-utility-action calculator-trigger";
    trigger.id = "walletCalculatorToggle";
    trigger.type = "button";
    trigger.title = "Open calculator";
    trigger.setAttribute("aria-label", "Open calculator");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "walletCalculator");
    trigger.innerHTML = '<i class="bi bi-calculator" aria-hidden="true"></i>';
    headerActions.appendChild(trigger);
    headerActions.appendChild(themeToggle);

    // The header controls are injected after the theme module's initial DOM scan.
    window.WalletCheckTheme?.applyTheme(
      document.documentElement.getAttribute("data-theme") || "dark"
    );
    themeToggle.addEventListener("click", () => window.WalletCheckTheme?.toggleTheme());

    document.body.insertAdjacentHTML("beforeend", calculatorMarkup());

    const engine = new CalculatorEngine();
    const layer = document.getElementById("walletCalculatorLayer");
    const panel = document.getElementById("walletCalculator");
    const output = layer.querySelector("[data-calculator-output]");
    const expression = layer.querySelector("[data-calculator-expression]");
    let previouslyFocused = null;

    function render() {
      output.textContent = engine.formatInput();
      output.title = engine.error ? "Calculation error" : engine.input;
      expression.textContent = engine.expression || "\u00a0";
      output.classList.toggle("calculator-output--compact", output.textContent.length > 14);
    }

    function openCalculator() {
      previouslyFocused = document.activeElement;
      layer.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => {
        layer.classList.add("is-open");
        panel.focus();
      });
    }

    function closeCalculator() {
      if (layer.hidden) return;
      layer.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      layer.hidden = true;
      (previouslyFocused || trigger).focus();
    }

    function runAction(action) {
      if (action === "clear") engine.clear();
      if (action === "sign") engine.toggleSign();
      if (action === "percent") engine.percentage();
      if (action === "decimal") engine.inputDecimal();
      if (action === "backspace") engine.backspace();
      if (action === "equals") engine.equals();
      render();
    }

    trigger.addEventListener("click", () => (layer.hidden ? openCalculator() : closeCalculator()));

    layer.addEventListener("click", (event) => {
      const closeControl = event.target.closest("[data-calculator-close]");
      if (closeControl) return closeCalculator();

      const digitControl = event.target.closest("[data-calculator-digit]");
      if (digitControl) engine.inputDigit(digitControl.dataset.calculatorDigit);

      const operatorControl = event.target.closest("[data-calculator-operator]");
      if (operatorControl) engine.inputOperator(operatorControl.dataset.calculatorOperator);

      const actionControl = event.target.closest("[data-calculator-action]");
      if (actionControl) runAction(actionControl.dataset.calculatorAction);
      else render();
    });

    document.addEventListener("keydown", (event) => {
      if (layer.hidden) return;

      if (event.key === "Escape") {
        event.preventDefault();
        return closeCalculator();
      }

      if (event.key === "Tab") {
        const focusable = Array.from(panel.querySelectorAll("button:not([disabled])"));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        engine.inputDigit(event.key);
      } else if (["+", "-", "*", "/"].includes(event.key)) {
        event.preventDefault();
        engine.inputOperator(event.key);
      } else if (event.key === ".") {
        event.preventDefault();
        engine.inputDecimal();
      } else if (event.key === "%") {
        event.preventDefault();
        engine.percentage();
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        engine.backspace();
      } else if (event.key === "Enter" || event.key === "=") {
        event.preventDefault();
        engine.equals();
      } else {
        return;
      }
      render();
    });

    render();
  }

  // Exposed for lightweight automated verification without coupling to application data.
  window.WalletCheckCalculator = { CalculatorEngine };
  document.addEventListener("DOMContentLoaded", setupCalculator);
})();
