import * as XLSX from 'xlsx';
import { hashCpf, hashString, isValidCpf, maskCpf, normalizeCpf, normalizeName } from './cpf';

export interface ParsedCollaboratorRow {
  rowNumber: number;
  cpfRaw: string;
  cpfNormalizado: string;
  cpfHash: string;
  cpfMascarado: string;
  nome: string;
  nomeNormalizado: string;
  centroCusto: string;
  funcao: string;
  valid: boolean;
  errorReason?: string;
  duplicateInFile?: boolean;
}

export interface CollaboratorColumnMapping {
  cpfIndex: number;
  nomeIndex: number;
  centroCustoIndex: number;
  funcaoIndex: number;
}

export interface InspectedExcelColumn {
  index: number;
  columnLetter: string;
  headerText: string;
  sampleValues: string[];
}

export interface InspectedCollaboratorWorkbook {
  fileHash: string;
  fileName: string;
  sheetName: string;
  rawMatrix: unknown[][];
  hasHeaderDetected: boolean;
  columns: InspectedExcelColumn[];
  suggestedMapping: CollaboratorColumnMapping;
  totalDataRowsEstimate: number;
}

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
}

function toColumnLetter(index: number): string {
  let n = index;
  let s = '';
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => normalizeHeader(h));
  for (const cand of candidates) {
    const exactIdx = normalized.findIndex((h) => h === cand);
    if (exactIdx !== -1) return exactIdx;
  }
  for (const cand of candidates) {
    const partialIdx = normalized.findIndex((h) => h.includes(cand));
    if (partialIdx !== -1) return partialIdx;
  }
  return -1;
}

function looksLikeHeaderRow(firstRow: unknown[]): boolean {
  const firstCellNorm = normalizeCpf(String(firstRow[0] ?? ''));
  if (firstCellNorm.length === 11 && /^\d{11}$/.test(firstCellNorm)) {
    return false;
  }

  const normalizedCells = firstRow.map((c) => normalizeHeader(String(c ?? '')));
  const knownTokens = [
    'cpf',
    'numerocpf',
    'doccpf',
    'documento',
    'nome',
    'nomecompleto',
    'colaborador',
    'funcionario',
    'centrodecusto',
    'centrocusto',
    'cc',
    'setor',
    'departamento',
    'funcao',
    'cargo',
    'ocupacao',
    'atividade',
  ];

  const matches = normalizedCells.filter((cell) =>
    knownTokens.some((token) => cell === token || cell.includes(token))
  ).length;

  return matches >= 2;
}

/**
 * Etapa 1 da importação: lê a planilha em matriz 2D, detecta cabeçalho
 * e sugere o mapeamento automático (se não houver cabeçalho, usa as 4 primeiras colunas:
 * 1=CPF, 2=Nome, 3=Centro de Custo, 4=Função).
 */
export async function inspectCollaboratorExcel(file: File): Promise<InspectedCollaboratorWorkbook> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binaryForHash = '';
  for (let i = 0; i < Math.min(bytes.length, 65536); i++) {
    binaryForHash += String.fromCharCode(bytes[i]);
  }
  const fileHash = await hashString(`${file.name}:${file.size}:${bytes.length}:${binaryForHash}`);

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('O arquivo Excel não possui nenhuma aba.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const matrixRaw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  const rawMatrix = matrixRaw.filter(
    (row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
  );

  if (rawMatrix.length === 0) {
    throw new Error('A planilha está vazia ou não possui linhas preenchidas.');
  }

  const maxCols = Math.max(4, ...rawMatrix.map((r) => r.length));
  const firstRow = rawMatrix[0] || [];
  const hasHeaderDetected = looksLikeHeaderRow(firstRow);

  const headerTexts = Array.from({ length: maxCols }, (_, idx) => {
    const rawText = String(firstRow[idx] ?? '').trim();
    return rawText || `Coluna ${idx + 1} (${toColumnLetter(idx)})`;
  });

  const dataPreviewRows = hasHeaderDetected ? rawMatrix.slice(1, 4) : rawMatrix.slice(0, 3);
  const columns: InspectedExcelColumn[] = Array.from({ length: maxCols }, (_, idx) => ({
    index: idx,
    columnLetter: toColumnLetter(idx),
    headerText: hasHeaderDetected ? headerTexts[idx] : `Coluna ${idx + 1} (${toColumnLetter(idx)})`,
    sampleValues: dataPreviewRows.map((r) => String(r[idx] ?? '').trim()).filter(Boolean),
  }));

  let cpfIndex = -1;
  let nomeIndex = -1;
  let centroCustoIndex = -1;
  let funcaoIndex = -1;

  if (hasHeaderDetected) {
    cpfIndex = findColumnIndex(headerTexts, ['cpf', 'numerocpf', 'doccpf', 'documento']);
    nomeIndex = findColumnIndex(headerTexts, ['nome', 'nomecompleto', 'colaborador', 'funcionario']);
    centroCustoIndex = findColumnIndex(headerTexts, [
      'centrodecusto',
      'centrocusto',
      'ccusto',
      'cc',
      'setor',
      'departamento',
      'area',
      'lotacao',
    ]);
    funcaoIndex = findColumnIndex(headerTexts, ['funcao', 'cargo', 'ocupacao', 'atividade']);
  }

  if (cpfIndex === -1) cpfIndex = 0;
  if (nomeIndex === -1) nomeIndex = maxCols > 1 ? 1 : 0;
  if (centroCustoIndex === -1) centroCustoIndex = maxCols > 2 ? 2 : 0;
  if (funcaoIndex === -1) funcaoIndex = maxCols > 3 ? 3 : 0;

  return {
    fileHash,
    fileName: file.name,
    sheetName: firstSheetName,
    rawMatrix,
    hasHeaderDetected,
    columns,
    suggestedMapping: {
      cpfIndex,
      nomeIndex,
      centroCustoIndex,
      funcaoIndex,
    },
    totalDataRowsEstimate: hasHeaderDetected ? Math.max(0, rawMatrix.length - 1) : rawMatrix.length,
  };
}

/**
 * Etapa 2 da importação: aplica o mapeamento escolhido, valida CPF (módulo 11),
 * identifica registros duplicados e impede colunas inválidas.
 */
export async function applyCollaboratorMapping(
  rawMatrix: unknown[][],
  hasHeader: boolean,
  mapping: CollaboratorColumnMapping
): Promise<{
  rows: ParsedCollaboratorRow[];
  mappingError?: string;
}> {
  const chosenIndices = [
    mapping.cpfIndex,
    mapping.nomeIndex,
    mapping.centroCustoIndex,
    mapping.funcaoIndex,
  ];
  if (new Set(chosenIndices).size < 4) {
    return {
      rows: [],
      mappingError:
        'Cada campo obrigatório (CPF, Nome, Centro de Custo e Função) deve apontar para uma coluna distinta na planilha.',
    };
  }

  const startIdx = hasHeader ? 1 : 0;
  if (rawMatrix.length <= startIdx) {
    return {
      rows: [],
      mappingError: 'Não há linhas de dados após o cabeçalho selecionado.',
    };
  }

  const seenCpfs = new Set<string>();
  const rows: ParsedCollaboratorRow[] = [];

  for (let i = startIdx; i < rawMatrix.length; i++) {
    const raw = rawMatrix[i] || [];
    const rowNumber = i + 1;
    const rawCpfCell = raw[mapping.cpfIndex];
    const isNum = typeof rawCpfCell === 'number';
    const cpfRaw = String(rawCpfCell ?? '').trim();
    const cpfNormalizado = normalizeCpf((rawCpfCell ?? '') as string | number, isNum);
    const nome = String(raw[mapping.nomeIndex] ?? '').trim();
    const centroCusto = String(raw[mapping.centroCustoIndex] ?? '').trim();
    const funcao = String(raw[mapping.funcaoIndex] ?? '').trim();

    if (!cpfRaw && !nome && !centroCusto && !funcao) continue;

    if (!cpfNormalizado) {
      rows.push({
        rowNumber,
        cpfRaw,
        cpfNormalizado: '',
        cpfHash: '',
        cpfMascarado: '***.***.***-**',
        nome,
        nomeNormalizado: normalizeName(nome),
        centroCusto,
        funcao,
        valid: false,
        errorReason: 'CPF não informado.',
      });
      continue;
    }

    if (!isValidCpf(cpfNormalizado)) {
      rows.push({
        rowNumber,
        cpfRaw,
        cpfNormalizado,
        cpfHash: '',
        cpfMascarado: maskCpf(cpfNormalizado),
        nome,
        nomeNormalizado: normalizeName(nome),
        centroCusto,
        funcao,
        valid: false,
        errorReason: 'CPF inválido (dígitos verificadores ou formato incorreto).',
      });
      continue;
    }

    if (!nome || nome.length < 2) {
      rows.push({
        rowNumber,
        cpfRaw,
        cpfNormalizado,
        cpfHash: '',
        cpfMascarado: maskCpf(cpfNormalizado),
        nome,
        nomeNormalizado: '',
        centroCusto,
        funcao,
        valid: false,
        errorReason: 'Nome do colaborador obrigatório.',
      });
      continue;
    }

    if (!centroCusto) {
      rows.push({
        rowNumber,
        cpfRaw,
        cpfNormalizado,
        cpfHash: '',
        cpfMascarado: maskCpf(cpfNormalizado),
        nome,
        nomeNormalizado: normalizeName(nome),
        centroCusto: '',
        funcao,
        valid: false,
        errorReason: 'Centro de custo obrigatório não informado.',
      });
      continue;
    }

    if (!funcao) {
      rows.push({
        rowNumber,
        cpfRaw,
        cpfNormalizado,
        cpfHash: '',
        cpfMascarado: maskCpf(cpfNormalizado),
        nome,
        nomeNormalizado: normalizeName(nome),
        centroCusto,
        funcao: '',
        valid: false,
        errorReason: 'Função obrigatória não informada.',
      });
      continue;
    }

    const duplicateInFile = seenCpfs.has(cpfNormalizado);
    seenCpfs.add(cpfNormalizado);
    const cpfHash = await hashCpf(cpfNormalizado);

    rows.push({
      rowNumber,
      cpfRaw,
      cpfNormalizado,
      cpfHash,
      cpfMascarado: maskCpf(cpfNormalizado),
      nome,
      nomeNormalizado: normalizeName(nome),
      centroCusto,
      funcao,
      valid: !duplicateInFile,
      duplicateInFile,
      errorReason: duplicateInFile ? 'CPF duplicado nesta mesma planilha.' : undefined,
    });
  }

  const validCount = rows.filter((r) => r.valid).length;
  if (rows.length > 0 && validCount === 0) {
    return {
      rows,
      mappingError:
        'Nenhum registro válido encontrado com o mapeamento atual. Verifique se a coluna selecionada como CPF realmente contém CPFs válidos.',
    };
  }

  return { rows };
}

export function exportRowsToExcel(
  filename: string,
  sheetName: string,
  rows: Record<string, string | number | boolean>[]
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const colWidths = Object.keys(rows[0] || { Coluna: '' }).map((key) => {
    const maxLen = Math.max(
      key.length,
      ...rows.map((r) => String(r[key] ?? '').length)
    );
    return { wch: Math.min(44, Math.max(14, maxLen + 3)) };
  });
  worksheet['!cols'] = colWidths;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

function generateSyntheticValidCpf(seed: number): string {
  const base: number[] = [];
  let val = seed;
  for (let i = 0; i < 9; i++) {
    val = (val * 37 + 13) % 97;
    base.push(val % 10);
  }
  if (base.every((d) => d === base[0])) base[8] = (base[0] + 1) % 10;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += base[i] * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 >= 10) d1 = 0;
  base.push(d1);

  sum = 0;
  for (let i = 0; i < 10; i++) sum += base[i] * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 >= 10) d2 = 0;
  base.push(d2);

  const s = base.join('');
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9, 11)}`;
}

export function downloadTemplateExcel(): void {
  const rows = [
    { CPF: generateSyntheticValidCpf(101), Nome: 'Colaborador Exemplo 01', 'Centro de Custo': 'CC-101 Operacional', Função: 'Técnico de Campo' },
    { CPF: generateSyntheticValidCpf(202), Nome: 'Colaborador Exemplo 02', 'Centro de Custo': 'CC-204 Administrativo', Função: 'Analista' },
    { CPF: generateSyntheticValidCpf(303), Nome: 'Colaborador Exemplo 03', 'Centro de Custo': 'CC-309 Logística', Função: 'Conferente' },
  ];
  exportRowsToExcel('modelo_planilha_colaboradores.xlsx', 'Colaboradores', rows);
}
