// Dados da ZXT usados pelo site. Edite aqui; o resto do site lê deste arquivo.
// Itens marcados com TODO_ZXT ainda dependem de informação real da equipe.
window.ZXT = {
  nome: "ZXT - Zulu Xtreme Team",
  instagram: "zxtoficial",
  // TODO_ZXT: número do WhatsApp só com dígitos, com DDI e DDD. Ex.: "5584999999999".
  // Enquanto estiver vazio, os botões levam para o direct do Instagram.
  whatsapp: "",
  endereco: "Av. Perimetral Sul, 500, Cidade da Esperança, Natal/RN, CEP 59071-550",

  modalidades: [
    { id: "muay-thai", nome: "Muay Thai", texto: "A arte das oito armas. Socos, chutes, joelhadas e cotoveladas, com condicionamento de atleta.", icone: "muaythai" },
    { id: "boxe", nome: "Boxe", texto: "Técnica, esquiva e trabalho de pés. Turma cedo e turma à noite para caber na sua rotina.", icone: "boxe" },
    { id: "mma", nome: "MMA", texto: "Trocação, queda e chão no mesmo treino. Para quem quer o pacote completo.", icone: "mma" },
    { id: "jiu-jitsu", nome: "Jiu-Jitsu", texto: "Alavanca, controle e finalização. A modalidade mais nova da família ZXT.", icone: "jiujitsu", novidade: true }
  ],

  // Grade de horários. Dias: seg, ter, qua, qui, sex, sab.
  grade: [
    { modalidade: "boxe", turma: "Turma 1", dias: ["seg", "qua"], hora: "07h" },
    { modalidade: "boxe", turma: "Turma 2", dias: ["ter", "qui"], hora: "18h" },
    { modalidade: "muay-thai", turma: "Turma 1", dias: ["seg", "qua"], hora: "19h" },
    { modalidade: "muay-thai", turma: "Turma 2", dias: ["seg", "qua"], hora: "20h" },
    { modalidade: "muay-thai", turma: "Turma 3", dias: ["ter", "qui"], hora: "06h" },
    { modalidade: "sparring", turma: "Toda a equipe", dias: ["sex"], hora: "19h" }
    // TODO_ZXT: turmas de MMA (dias e horário)
    // TODO_ZXT: turmas de Jiu-Jitsu (dias e horário)
  ],

  // Eventos. Datas no formato aaaa-mm-dd. Eventos passados somem sozinhos do site.
  eventos: [
    {
      titulo: "Exame de graduação de Muay Thai 2026",
      data: "2026-11-28",
      hora: "15h30",
      local: "Rua São Nicolau, 309, Felipe Camarão, Natal/RN",
      texto: "Dia de mostrar a evolução do ano. Confirme o prajied com seu professor e faça a inscrição com pagamento online.",
      inscricao: "/evento/graduacao-2026"
    }
  ],

  // TODO_ZXT: nomes, modalidades e foto (arquivo em /assets) dos professores.
  // Enquanto a lista estiver vazia, a seção mostra um convite para conhecer o time no Instagram.
  professores: [
    // { nome: "Nome", modalidades: "Muay Thai e Boxe", foto: "/assets/prof-nome.jpg" }
  ]
};
