const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeJid } = require('./permissions');

const BANK_FILE_PATH = path.join(__dirname, '..', 'config', 'bank.json');
const CURRENCY_SYMBOL = '\u0e3f';
const STARTING_BALANCE = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

const sanitizeJid = (jid) => normalizeJid(jid);
const clampAmount = (value) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value) => {
  const safe = Math.floor(Number(value) || 0);
  return `${CURRENCY_SYMBOL}${safe.toLocaleString('it-IT')}`;
};

const computeNextMidnight = (from = Date.now()) => {
  const date = new Date(from);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
};

async function createBankService({ logger }) {
  let data = { accounts: {} };

  const load = async () => {
    try {
      const raw = await fs.readFile(BANK_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      data =
        parsed && typeof parsed === 'object'
          ? { accounts: parsed.accounts || {}, updatedAt: parsed.updatedAt || Date.now() }
          : { accounts: {} };
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logger?.warn({ err: error }, 'Impossibile leggere il file BagleyBank');
      }
      data = { accounts: {} };
    }
  };

  const persist = async () => {
    try {
      await fs.mkdir(path.dirname(BANK_FILE_PATH), { recursive: true });
      const payload = {
        accounts: data.accounts,
        updatedAt: Date.now()
      };
      await fs.writeFile(BANK_FILE_PATH, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      logger?.error({ err: error }, 'Impossibile salvare il file BagleyBank');
    }
  };

  await load();

  const getAccountEntry = (jid) => {
    const normalized = sanitizeJid(jid);
    if (!normalized) {
      return { jid: null, entry: null };
    }
    if (!data.accounts[normalized]) {
      return { jid: normalized, entry: null };
    }
    return { jid: normalized, entry: data.accounts[normalized] };
  };

  const cloneAccount = (entry) => {
    if (!entry) {
      return null;
    }
    return {
      balance: entry.balance,
      createdAt: entry.createdAt,
      loan: entry.loan
        ? {
            principal: entry.loan.principal,
            interestRate: entry.loan.interestRate,
            totalDue: entry.loan.totalDue,
            remaining: entry.loan.remaining,
            installmentCount: entry.loan.installmentCount,
            installmentAmount: entry.loan.installmentAmount,
            grantedAt: entry.loan.grantedAt,
            nextDebitAt: entry.loan.nextDebitAt,
            lastDebitAt: entry.loan.lastDebitAt
          }
        : null
    };
  };

  const settleLoan = (entry, now = Date.now()) => {
    const loan = entry?.loan;
    if (!loan) {
      return false;
    }
    if (!loan.nextDebitAt) {
      loan.nextDebitAt = computeNextMidnight(loan.lastDebitAt || loan.grantedAt || now);
    }
    let changed = false;
    const resolvedInstallment =
      clampAmount(loan.installmentAmount) ||
      clampAmount(Math.ceil((loan.totalDue || loan.remaining || 0) / 12)) ||
      1;
    while (loan.remaining > 0 && now >= loan.nextDebitAt) {
      const installmentTarget = Math.min(resolvedInstallment, loan.remaining);
      const available = Math.max(0, clampAmount(entry.balance));
      const charge = Math.min(installmentTarget, available);
      if (charge > 0) {
        entry.balance = clampAmount(entry.balance - charge);
        loan.remaining = clampAmount(loan.remaining - charge);
        changed = true;
      }
      loan.lastDebitAt = loan.nextDebitAt;
      loan.nextDebitAt += DAY_MS;
      if (loan.remaining <= 0) {
        break;
      }
    }
    if (loan.remaining <= 0) {
      delete entry.loan;
      changed = true;
    }
    return changed;
  };

  const ensureAccount = async (jid) => {
    const normalized = sanitizeJid(jid);
    if (!normalized) {
      return { jid: null, entry: null };
    }
    if (!data.accounts[normalized]) {
      data.accounts[normalized] = {
        balance: 0,
        createdAt: Date.now()
      };
    }
    return { jid: normalized, entry: data.accounts[normalized] };
  };

  return {
    CURRENCY_SYMBOL,
    formatCurrency,
    async createAccount(jid) {
      const normalized = sanitizeJid(jid);
      if (!normalized) {
        return { error: 'JID non valido.' };
      }
      if (data.accounts[normalized]) {
        return { error: 'Hai gia\' un account BagleyBank attivo.' };
      }
      data.accounts[normalized] = {
        balance: STARTING_BALANCE,
        createdAt: Date.now()
      };
      await persist();
      return { account: cloneAccount(data.accounts[normalized]) };
    },
    async deleteAccount(jid) {
      const normalized = sanitizeJid(jid);
      if (!normalized) {
        return { error: 'JID non valido.' };
      }
      const entry = data.accounts[normalized];
      if (!entry) {
        return { error: 'Non hai nessun account da eliminare.' };
      }
      if (entry.loan) {
        return { error: 'Estingui prima il prestito attivo, poi elimina l\'account.' };
      }
      delete data.accounts[normalized];
      await persist();
      return { success: true };
    },
    async settleAccount(jid) {
      const normalized = sanitizeJid(jid);
      if (!normalized) {
        return null;
      }
      const entry = data.accounts[normalized];
      if (!entry) {
        return null;
      }
      const changed = settleLoan(entry);
      if (changed) {
        await persist();
      }
      return cloneAccount(entry);
    },
    async getAccount(jid, { settle = false } = {}) {
      if (settle) {
        await this.settleAccount(jid);
      }
      const { entry } = getAccountEntry(jid);
      return cloneAccount(entry);
    },
    async adjustBalance(jid, delta) {
      const normalized = sanitizeJid(jid);
      if (!normalized) {
        return { error: 'JID non valido.' };
      }
      const entry = data.accounts[normalized];
      if (!entry) {
        return { error: 'L\'account indicato non esiste.' };
      }
      entry.balance = clampAmount(entry.balance + clampAmount(delta));
      await persist();
      return { account: cloneAccount(entry) };
    },
    async transfer(fromJid, toJid, amount) {
      const value = clampAmount(amount);
      if (value <= 0) {
        return { error: 'L\'importo deve essere positivo.' };
      }
      const fromNormalized = sanitizeJid(fromJid);
      const toNormalized = sanitizeJid(toJid);
      if (!fromNormalized || !toNormalized) {
        return { error: 'JID non valido.' };
      }
      if (fromNormalized === toNormalized) {
        return { error: 'Non puoi donare a te stesso.' };
      }
      const fromEntry = data.accounts[fromNormalized];
      const toEntry = data.accounts[toNormalized];
      if (!fromEntry) {
        return { error: 'Non hai un account BagleyBank.' };
      }
      if (!toEntry) {
        return { error: 'Il destinatario non ha un account BagleyBank.' };
      }
      if (fromEntry.balance < value) {
        return { error: 'Saldo insufficiente per completare la donazione.' };
      }
      fromEntry.balance = clampAmount(fromEntry.balance - value);
      toEntry.balance = clampAmount(toEntry.balance + value);
      await persist();
      return {
        from: cloneAccount(fromEntry),
        to: cloneAccount(toEntry)
      };
    },
    async grantLoan(jid, amount) {
      const normalized = sanitizeJid(jid);
      if (!normalized) {
        return { error: 'JID non valido.' };
      }
      const value = clampAmount(amount);
      if (value <= 0) {
        return { error: 'L\'importo del prestito deve essere positivo.' };
      }
      const entry = data.accounts[normalized];
      if (!entry) {
        return { error: 'Crea prima un account BagleyBank.' };
      }
      if (entry.loan) {
        return { error: 'Hai gia\' un prestito attivo.' };
      }
      const interestRate = Math.floor(Math.random() * 30) + 1;
      const totalDue = clampAmount(Math.ceil(value * (1 + interestRate / 100)));
      const installmentAmount = Math.max(1, clampAmount(Math.ceil(totalDue / 12)));
      entry.balance = clampAmount(entry.balance + value);
      entry.loan = {
        principal: value,
        interestRate,
        totalDue,
        remaining: totalDue,
        installmentCount: 12,
        installmentAmount,
        grantedAt: Date.now(),
        lastDebitAt: null,
        nextDebitAt: computeNextMidnight()
      };
      await persist();
      return { account: cloneAccount(entry) };
    },
    async applyManualPayment(jid, amount) {
      const normalized = sanitizeJid(jid);
      if (!normalized) {
        return { error: 'JID non valido.' };
      }
      const entry = data.accounts[normalized];
      if (!entry) {
        return { error: 'Non hai un account BagleyBank.' };
      }
      if (!entry.loan) {
        return { error: 'Non hai prestiti attivi.' };
      }
      const value = clampAmount(amount);
      if (value <= 0) {
        return { error: 'L\'importo deve essere positivo.' };
      }
      if (entry.balance < value) {
        return { error: 'Saldo insufficiente per effettuare il pagamento.' };
      }
      entry.balance = clampAmount(entry.balance - value);
      entry.loan.remaining = clampAmount(entry.loan.remaining - value);
      if (entry.loan.remaining <= 0) {
        delete entry.loan;
      }
      await persist();
      return { account: cloneAccount(entry) };
    },
    async listAccounts() {
      return Object.entries(data.accounts).map(([jid, entry]) => ({
        jid,
        balance: clampAmount(entry.balance),
        createdAt: entry.createdAt,
        hasLoan: Boolean(entry.loan)
      }));
    }
  };
}

module.exports = {
  createBankService,
  BANK_FILE_PATH,
  CURRENCY_SYMBOL,
  STARTING_BALANCE,
  formatCurrency
};
