# Security Specification & Hardened Rules Verification

## 1. Data Invariants
1. **Identidade Única por CPF (Hash SHA-256)**: Todo colaborador é indexado por seu `cpfHash` de 64 caracteres hexadecimais. CPFs em texto claro nunca são armazenados nos IDs ou documentos; apenas `cpfMascarado` (`***.456.789-**`) é exibido.
2. **Controle Permanente de Recebimento e Devolução**: Um colaborador possui status `JÁ RECEBEU` quando possui coletor ativo (`possuiColetorAtivo == true`, ou registro legado com `totalColetoresRecebidos >= 1`), e retorna para `NÃO RECEBEU` ao marcar devolução (`possuiColetorAtivo = false`), preservando `totalColetoresRecebidos`, `ultimaEntregaData` e todos os registros de `entregas` e `colaboradores_historico`. Cada registro de entrega em `entregas/{entregaId}` exige que o colaborador e a ação existam e atualiza atomicamente o colaborador via `getAfter(...)`.
3. **Preservação Histórica**: Atualizações cadastrais (`nome`, `centroCusto`, `funcao`) em reimportações nunca sobrescrevem `possuiColetorAtivo`, `totalColetoresRecebidos`, `totalColetoresDevolvidos`, `ultimaEntregaId`, `ultimaEntregaData` ou `ultimaEntregaDataHora`.
4. **RBAC Granular (8 Permissões) & Isolamento de PII**: `users/{userId}` e `user_invites/{inviteId}` armazenam e-mails e as 8 permissões (`importarPlanilhas`, `visualizarColaboradores`, `marcarEntregas`, `consultarHistorico`, `exportarRelatorios`, `excluirHistorico`, `excluirCadastros`, `gerenciarUsuarios`). Leitura de outros perfis é restrita a usuários autorizados com `gerenciarUsuarios` ou administrador principal. Auto-promoção a `admin` é bloqueada.
5. **Exclusões Seguras por Permissão**:
   - Exclusão individual ou total de entregas (`excluirHistorico`) remove documentos em `entregas` (e eventos de entrega/devolução na limpeza geral) recalculando o estado de posse/entrega do colaborador.
   - Exclusão individual completa por CPF (`excluirCadastros`) remove todos os registros vinculados ao `cpfHash` (`colaboradores`, `entregas`, `colaboradores_historico`, `importacao_itens`) e atualiza contadores de ações abertas/vinculadas.
   - Reinicialização em massa completa de toda a base operacional (`empresas`, `unidades`, `acoes`, `importacoes`, `auditoria`, coleções legadas) continua restrita a `isBootstrappedAdmin()`, preservando `users`, `admins`, `configuracoes`, projeto Firebase e conta Auth.
6. **Integridade Temporal**: Campos `createdAt` e `updatedAt` exigem estritamente `request.time`.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read**: `getDoc(doc(db, 'colaboradores', 'abc...'))` com `auth == null`.
2. **Unverified Email Write**: `setDoc(doc(db, 'empresas', 'emp1'), ...)` com `email_verified: false`.
3. **Self-Assigned Admin Role**: `setDoc(doc(db, 'users', uid), { role: 'admin', ... })` por usuário não administrador.
4. **Shadow Field Injection**: `setDoc(doc(db, 'colaboradores', hash), { ..., isAdminOverride: true })`.
5. **Junk Document ID Poisoning**: `setDoc(doc(db, 'empresas', 'a'.repeat(500)), ...)`.
6. **Cross-User PII Scraping (`users` list)**: `getDocs(collection(db, 'users'))` por operador sem `gerenciarUsuarios`.
7. **Orphaned Delivery Write**: `setDoc(doc(db, 'entregas', 'e1'), { colaboradorHash: 'inexistente', ... })` sem transação atômica em `colaboradores`.
8. **Unauthorized Collaborator or History Delete**: `deleteDoc(doc(db, 'colaboradores', hash))` por operador sem `excluirCadastros` ou `deleteDoc(doc(db, 'entregas', id))` por operador sem `excluirHistorico`/`excluirCadastros`.
9. **Spoofed Creator UID**: `setDoc(doc(db, 'entregas', 'e1'), { createdByUid: 'other_uid', ... })`.
10. **Forged Timestamp**: `setDoc(doc(db, 'auditoria', 'a1'), { createdAt: new Date('2020-01-01') })`.
11. **Audit Log Tampering**: `updateDoc(doc(db, 'auditoria', 'a1'), { descricao: 'tampered' })`.
12. **Oversized String DoS**: `setDoc(doc(db, 'empresas', 'emp1'), { nome: 'x'.repeat(5000) })`.
