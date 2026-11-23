# Security Specification & Hardened Rules Verification

## 1. Data Invariants
1. **Identidade Única por CPF (Hash SHA-256)**: Todo colaborador é indexado por seu `cpfHash` de 64 caracteres hexadecimais. CPFs em texto claro nunca são armazenados nos IDs ou documentos; apenas `cpfMascarado` (`***.456.789-**`) é exibido.
2. **Controle Permanente de Recebimento**: Um colaborador possui status `JÁ RECEBEU` se possuir pelo menos um registro de entrega (`totalColetoresRecebidos >= 1`), ou `NÃO RECEBEU` caso contrário. Cada registro de entrega em `entregas/{entregaId}` exige que o colaborador e a ação existam e atualiza atomicamente o colaborador via `getAfter(...)`.
3. **Preservação Histórica**: Atualizações cadastrais (`nome`, `centroCusto`, `funcao`) em reimportações nunca sobrescrevem `totalColetoresRecebidos`, `ultimaEntregaId`, `ultimaEntregaData` ou `ultimaEntregaDataHora`.
4. **RBAC Granular & Isolamento de PII**: `users/{userId}` e `user_invites/{inviteId}` armazenam e-mails e permissões (`importarPlanilhas`, `visualizarColaboradores`, `marcarEntregas`, `consultarHistorico`, `exportarRelatorios`, `gerenciarUsuarios`). Leitura de outros perfis é restrita a usuários autorizados com `gerenciarUsuarios` ou administrador principal. Auto-promoção a `admin` é bloqueada.
5. **Reinicialização Segura da Base Operacional**: Exclusão em massa de dados operacionais (`colaboradores`, `colaboradores_historico`, `entregas`, `importacoes`, `importacao_itens`, `acoes`, `unidades`, `empresas`, `auditoria`, além de coleções legadas `exames`/`remessas`) é estritamente restrita ao administrador principal verificado (`isBootstrappedAdmin()`), preservando `users`, `admins`, `configuracoes`, projeto Firebase e conta Auth.
6. **Integridade Temporal**: Campos `createdAt` e `updatedAt` exigem estritamente `request.time`.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read**: `getDoc(doc(db, 'colaboradores', 'abc...'))` com `auth == null`.
2. **Unverified Email Write**: `setDoc(doc(db, 'empresas', 'emp1'), ...)` com `email_verified: false`.
3. **Self-Assigned Admin Role**: `setDoc(doc(db, 'users', uid), { role: 'admin', ... })` por usuário não administrador.
4. **Shadow Field Injection**: `setDoc(doc(db, 'colaboradores', hash), { ..., isAdminOverride: true })`.
5. **Junk Document ID Poisoning**: `setDoc(doc(db, 'empresas', 'a'.repeat(500)), ...)`.
6. **Cross-User PII Scraping (`users` list)**: `getDocs(collection(db, 'users'))` por operador sem `gerenciarUsuarios`.
7. **Orphaned Delivery Write**: `setDoc(doc(db, 'entregas', 'e1'), { colaboradorHash: 'inexistente', ... })` sem transação atômica em `colaboradores`.
8. **Unauthorized Bulk Delete**: `deleteDoc(doc(db, 'colaboradores', hash))` por operador comum (apenas `isBootstrappedAdmin()` pode reiniciar a base).
9. **Spoofed Creator UID**: `setDoc(doc(db, 'entregas', 'e1'), { createdByUid: 'other_uid', ... })`.
10. **Forged Timestamp**: `setDoc(doc(db, 'auditoria', 'a1'), { createdAt: new Date('2020-01-01') })`.
11. **Audit Log Tampering**: `updateDoc(doc(db, 'auditoria', 'a1'), { descricao: 'tampered' })`.
12. **Oversized String DoS**: `setDoc(doc(db, 'empresas', 'emp1'), { nome: 'x'.repeat(5000) })`.
