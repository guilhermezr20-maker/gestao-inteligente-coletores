/**
 * Normaliza um CPF removendo quaisquer caracteres não numéricos.
 * Se vier como número de planilha Excel com 9 ou 10 dígitos (zero à esquerda suprimido),
 * preenche zeros à esquerda até 11 dígitos quando o CPF resultante for válido.
 */
export function normalizeCpf(raw: string | number | null | undefined, fromNumericCell = false): string {
  if (raw === null || raw === undefined) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (fromNumericCell && digits.length >= 9 && digits.length < 11) {
    const padded = digits.padStart(11, '0');
    if (isValidCpf(padded)) return padded;
  }
  return digits;
}

/**
 * Valida dígitos verificadores de CPF conforme algoritmo oficial (Módulo 11).
 */
export function isValidCpf(cpfInput: string | number | null | undefined): boolean {
  if (cpfInput === null || cpfInput === undefined) return false;
  const cpf = String(cpfInput).replace(/\D/g, '');
  if (cpf.length !== 11) return false;

  // Rejeita sequências repetidas conhecidas (000..., 111..., etc.)
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(cpf.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== Number(cpf.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(cpf.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== Number(cpf.charAt(10))) return false;

  return true;
}

/**
 * Mascara o CPF conforme boas práticas de LGPD: ***.456.789-**
 */
export function maskCpf(cpfDigits: string): string {
  const clean = cpfDigits.replace(/\D/g, '');
  if (clean.length !== 11) return '***.***.***-**';
  return `***.${clean.slice(3, 6)}.${clean.slice(6, 9)}-**`;
}

/**
 * Formata CPF completo caso seja necessário exibir em conferência restrita (não persistido em texto plano).
 */
export function formatCpfFull(cpfDigits: string): string {
  const clean = cpfDigits.replace(/\D/g, '');
  if (clean.length !== 11) return cpfDigits;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

/**
 * Gera hash SHA-256 determinístico (64 hex chars) para indexar o colaborador sem expor o CPF bruto.
 */
export async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashCpf(cpfNormalizado: string): Promise<string> {
  return hashString(`cpf_coletor_v1:${cpfNormalizado}`);
}

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
