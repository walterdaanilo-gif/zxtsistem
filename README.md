# Site oficial ZXT - Zulu Xtreme Team

Site público estático (HTML, CSS e JS, sem build) publicado na Vercel.

- `/`: página da equipe (modalidades, grade, eventos, time, loja, endereço)
- `/experimental`: link da bio do Instagram. Aceita `?origem=instagram`, `?modalidade=muay-thai` e `?indicou=Nome`

## Editar conteúdo
Tudo fica em `assets/config.js`: WhatsApp, grade, eventos e professores. Eventos com data passada somem sozinhos.

## Pendências (TODO_ZXT)
- Número do WhatsApp (enquanto vazio, os botões abrem o direct do Instagram)
- Horários de MMA e Jiu-Jitsu
- Nomes e fotos dos professores
- Logo oficial (hoje `assets/logo.svg` é um placeholder)

## Rodar local
```
python3 -m http.server 4173
```
Abra http://localhost:4173 (a rota `/experimental` sem `.html` só funciona na Vercel).
