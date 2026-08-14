/* ============================================================
   [VAULT] TICKET SYSTEM v4 — su logo nuotrauka visuose embed'uose
============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');

let discord;
try { discord = require('discord.js'); } catch (e) {
  console.error('❌ Nerasta discord.js!');
  process.exit(1);
}
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits, ChannelType
} = discord;

/* ---------------- LOGO (pakeisk į savo raw nuorodą jei reikia) ---------------- */
const LOGO_URL = 'https://raw.githubusercontent.com/Vaultshop/Vaults/main/logo.png';

/* ---------------- DB ---------------- */
const DB_FILE = path.join(__dirname, 'db.json');
const defaults = {
  token: '', botName: '[Vault]', ownerId: '', staffRoleId: '',
  ticketCategoryId: '', closedCategoryId: '', logChannelId: '', panelChannelId: '',
  maxActive: 2,
  addresses: { LTC: '', BTC: '', SOL: '', ETH: '' },
  stats: { viso: 0, aktyvus: 0, uzdaryti: 0, apmoketi: 0, pristatyti: 0, refund: 0 },
  tickets: {}, panel: { channelId: '', messageId: '' }
};
let db = null;
function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) db = Object.assign({}, defaults, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
    else db = JSON.parse(JSON.stringify(defaults));
  } catch (e) { db = JSON.parse(JSON.stringify(defaults)); }
  if (!db.token && process.env.TOKEN) db.token = process.env.TOKEN;
  if (!db.ownerId && process.env.OWNER_ID) db.ownerId = process.env.OWNER_ID;
  if (!db.staffRoleId && process.env.STAFF_ROLE_ID) db.staffRoleId = process.env.STAFF_ROLE_ID;
  return db;
}
function saveDb() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function dbGet() { if (!db) loadDb(); return db; }
function dbSet(p) { dbGet(); Object.assign(db, p); saveDb(); }

/* ---------------- Kategorijos ---------------- */
const CATEGORIES = [
  { id: 'uzsakymas',    emoji: '🛒', label: 'Užsakymas',    desc: 'Noriu ką nors užsisakyti' },
  { id: 'klausimas',    emoji: '❓', label: 'Klausimas',    desc: 'Turiu klausimą administracijai' },
  { id: 'replace',      emoji: '🔄', label: 'Replace',      desc: 'Prekė neveikia — reikia pakeitimo' },
  { id: 'atsiimti',     emoji: '🎁', label: 'Atsiimti',     desc: 'Noriu atsiimti apmokėtą prekę' },
  { id: 'partneriauti', emoji: '🤝', label: 'Partneriauti', desc: 'Partnerystės pasiūlymas' },
  { id: 'leakseris',    emoji: '📄', label: 'Leakseris',    desc: 'Noriu tapti leakseriu' },
  { id: 'refund',       emoji: '💸', label: 'Refund',       desc: 'Noriu susigrąžinti pinigus' }
];

/* ---------------- Embed'ai su LOGO ---------------- */
function baseEmbed(s, guild, color) {
  const n = s.botName || '[Vault]';
  return new EmbedBuilder()
    .setColor(color || 0x22c55e)
    .setAuthor({ name: n + ' │ Support', iconURL: LOGO_URL })
    .setFooter({ text: n + ' • Support', iconURL: LOGO_URL })
    .setTimestamp();
}
function panelEmbed(s, guild) {
  const n = s.botName || '[Vault]';
  return baseEmbed(s, guild, 0x22c55e)
    .setDescription(
      '🎟️ **│ TICKET SISTEMA**\n\n' +
      'Sveiki atvykę į **' + n + '** pagalbos centrą!\n' +
      'Paspausk atitinkamos kategorijos mygtuką apačioje 🎫\n\n' +
      '📋 **│ Taisyklės**\n' +
      '> • Pasirink **teisingą kategoriją**, kitaip bilietas bus uždarytas\n' +
      '> • Max **' + (s.maxActive || 2) + '** aktyvūs bilietai vienu metu\n' +
      '> • Atsakome kuo greičiau — **netagink** administracijos\n\n' +
      '🗂️ **│ Kategorijos**\n' +
      CATEGORIES.map(c => '> ' + c.emoji + '・**' + c.label + '** — ' + c.desc).join('\n') +
      '\n\n💬 Tavo užklausą išvysime iš karto — sėkmės! 💚'
    )
    .setThumbnail(LOGO_URL);
}
function ticketEmbed(s, user, cat, num, guild, question) {
  return baseEmbed(s, guild, 0x22c55e)
    .setDescription(
      '🎟️ **│ Bilietas #' + num + '**\n\n' +
      'Sveikas, <@' + user.id + '>! 👋\n\n' +
      'Tavo bilietas **sėkmingai sukurtas**. Staff komanda netrukus peržiūrės užklausą — prašome šiek tiek kantrybės.\n\n' +
      '📝 **│ Užklausa**\n> ' + (question || '—') + '\n\n' +
      '📋 **│ Informacija**\n' +
      '> • Kategorija: ' + cat.emoji + '・**' + cat.label + '**\n' +
      '> • Bilieto ID: `#' + num + '`\n' +
      '> • Klientas: <@' + user.id + '>\n' +
      '> • Sukurta: <t:' + Math.floor(Date.now() / 1000) + ':F>\n\n' +
      '⏳ Kad viskas vyktų sklandžiai — **netagink** administracijos. Mes patys su tavimi susisieksime! 💚'
    )
    .setThumbnail(LOGO_URL);
}
function staffEmbed(s, guild, emoji, title, body, color) {
  return baseEmbed(s, guild, color || 0x22c55e)
    .setDescription(emoji + ' **│ ' + title + '**\n\n' + body);
}

/* ---------------- Greitos žinutės ---------------- */
function quickMessages(s) {
  const a = s.addresses || {};
  const pay = (coin, addr) =>
    'Mokėk **tikslią sumą** į šį adresą ir atsiųsk **payslip** šioje ticketėje 📎\n\n\`\`\`' + (addr || coin + ' adresas nenustatytas (Nustatymai)') + '\`\`\`';
  return [
    { value: 'hi', label: '👋 Sveiki / atsiskaitymas', desc: 'Trumpas atsakymas klientui', emoji: '👋', title: 'Sveiki!', color: 0x22c55e,
      body: 'Ačiū, kad pasirinkai mūsų paslaugas 💚\nParašyk savo klausimą / užsakymą — staff netrukus atsakys.' },
    { value: 'btc', label: '💳 BTC adresas', desc: 'Įmeta Bitcoin apmokėjimo adresą', emoji: '💳', title: 'BTC apmokėjimas', color: 0xf7931a, body: pay('BTC', a.BTC) },
    { value: 'ltc', label: '💳 LTC adresas', desc: 'Įmeta Litecoin apmokėjimo adresą', emoji: '💳', title: 'LTC apmokėjimas', color: 0x345d9d, body: pay('LTC', a.LTC) },
    { value: 'eth', label: '💳 ETH adresas', desc: 'Įmeta Ethereum apmokėjimo adresą', emoji: '💳', title: 'ETH apmokėjimas', color: 0x627eea, body: pay('ETH', a.ETH) },
    { value: 'sol', label: '💳 SOL adresas', desc: 'Įmeta Solana apmokėjimo adresą', emoji: '💳', title: 'SOL apmokėjimas', color: 0x9945ff, body: pay('SOL', a.SOL) },
    { value: 'nostock', label: '⛔ Prekės neturime', desc: 'Atsiprašymas + laukiame papildymo', emoji: '⛔', title: 'Prekės neturime', color: 0xef4444,
      body: 'Atsiprašome — šiuo metu **prekės neturime** 🙏\nLaukiame papildymo. Informuosime iš karto, kai tik ji atsiras!' },
    { value: 'refund-done', label: '💸 Refund atliktas', desc: 'Trumpa žinutė', emoji: '💸', title: 'Refund atliktas', color: 0x22c55e,
      body: 'Pinigai **grąžinti** ✅\nPavedimas gali užtrukti iki 24 val.' },
    { value: 'refund-no', label: '🚫 Refund negalimas', desc: 'Pinigai negali būti grąžinti', emoji: '🚫', title: 'Refund negalimas', color: 0xef4444,
      body: 'Pagal taisykles pinigai šiuo atveju **negali būti grąžinti** ❌' }
  ];
}

function panelRows() {
  const rows = [];
  for (let i = 0; i < CATEGORIES.length; i += 4) {
    const row = new ActionRowBuilder();
    CATEGORIES.slice(i, i + 4).forEach(c => row.addComponents(
      new ButtonBuilder().setCustomId('panel:' + c.id).setLabel(c.label).setEmoji(c.emoji).setStyle(ButtonStyle.Success)
    ));
    rows.push(row);
  }
  return rows;
}
const btn = (id, emoji, label, style) => new ButtonBuilder().setCustomId(id).setEmoji(emoji).setLabel(label).setStyle(style);
function staffRows(s) {
  const r1 = new ActionRowBuilder().addComponents(
    btn('t:claim', '🙋', 'Apsiimti', ButtonStyle.Success), btn('t:paid', '💰', 'Apmokėta', ButtonStyle.Success),
    btn('t:send', '📦', 'Siusti prekę', ButtonStyle.Success), btn('t:done', '✅', 'Atlikta', ButtonStyle.Success));
  const r2 = new ActionRowBuilder().addComponents(
    btn('t:remind', '⏰', 'Priminti', ButtonStyle.Secondary), btn('t:rename', '✏️', 'Pervadinti', ButtonStyle.Secondary),
    btn('t:info', '👤', 'Info', ButtonStyle.Secondary), btn('t:close', '🔒', 'Uždaryti', ButtonStyle.Danger));
  const r3 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('t:quick').setPlaceholder('Greitos staff žinutės...')
      .addOptions(quickMessages(s).map(q => ({ label: q.label, value: q.value, description: q.desc }))));
  return [r1, r2, r3];
}

function isStaff(i) {
  const s = dbGet();
  if (i.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (s.staffRoleId && i.member.roles.cache.has(s.staffRoleId)) return true;
  if (s.ownerId && i.user.id === s.ownerId) return true;
  return false;
}
function log(s, guild, text) {
  if (!s.logChannelId) return;
  const ch = guild.channels.cache.get(s.logChannelId);
  if (ch) ch.send({ content: text }).catch(() => {});
}

/* ---------------- Ticket kūrimas ---------------- */
async function createTicket(i, cat, question) {
  const s = dbGet();
  const max = Number(s.maxActive) || 2;
  const open = Object.values(s.tickets).filter(t => t.userId === i.user.id && t.status === 'open');
  if (open.length >= max) return i.reply({ embeds: [staffEmbed(s, i.guild, '❌', 'Per daug bilietų', 'Max **' + max + '** aktyvūs bilietai vienu metu.\nPalauk, kol vienas bus uždarytas.', 0xef4444)], ephemeral: true });
  await i.deferReply({ ephemeral: true });
  const guild = i.guild;
  const num = (Number(s.stats.viso) || 0) + 1;
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
  ];
  if (s.staffRoleId) overwrites.push({ id: s.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  const parent = s.ticketCategoryId && guild.channels.cache.get(s.ticketCategoryId) ? s.ticketCategoryId : undefined;
  const name = ((cat.id + '-' + i.user.username).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)) || ('ticket-' + num);
  const ch = await guild.channels.create({ name, type: ChannelType.GuildText, parent, permissionOverwrites: overwrites, topic: 'Ticket #' + num + ' | ' + i.user.tag + ' | ' + cat.label });
  s.stats.viso = num;
  s.stats.aktyvus = (Number(s.stats.aktyvus) || 0) + 1;
  s.tickets[ch.id] = { id: num, userId: i.user.id, category: cat.id, status: 'open', claimedBy: null, question: question || '', createdAt: Date.now() };
  saveDb();
  const msg = await ch.send({ content: '<@' + i.user.id + '>', embeds: [ticketEmbed(s, i.user, cat, num, guild, question)], components: staffRows(s) });
  try { await msg.pin(); } catch (e) {}
  await i.editReply({ content: '✅ Bilietas **#' + num + '** sukurtas: <#' + ch.id + '>' });
  log(s, guild, '🟢 **Sukurtas ticket #' + num + '** — ' + i.user.tag + ' (' + cat.label + ')');
}

async function closeTicket(i) {
  const s = dbGet();
  const ch = i.channel;
  const t = s.tickets[ch.id];
  await i.deferReply();
  if (t && t.status === 'open') {
    t.status = 'closed';
    s.stats.aktyvus = Math.max(0, (Number(s.stats.aktyvus) || 0) - 1);
    s.stats.uzdaryti = (Number(s.stats.uzdaryti) || 0) + 1;
    saveDb();
  }
  try {
    if (t) {
      const m = await i.guild.members.fetch(t.userId).catch(() => null);
      if (m) await ch.permissionOverwrites.edit(m.id, { SendMessages: false, AddReactions: false }).catch(() => {});
    }
  } catch (e) {}
  if (s.closedCategoryId && i.guild.channels.cache.get(s.closedCategoryId)) await ch.setParent(s.closedCategoryId).catch(() => {});
  await i.editReply({ embeds: [staffEmbed(s, i.guild, '🔒', 'Bilietas uždarytas', 'Uždarė: <@' + i.user.id + '>\nKanalas **užrakintas** ir perkeltas į archyvą 📁', 0xef4444)] });
  log(s, i.guild, '🔒 **Uždarytas ticket** ' + ch.name + ' (uždarė ' + i.user.tag + ')');
}

async function sendPanel(client, channelId) {
  const s = dbGet();
  const guild = client.guilds.cache.first();
  if (!guild) throw new Error('Botas dar nėra nė viename serveryje');
  if (s.panel.messageId && s.panel.channelId) {
    const oldCh = guild.channels.cache.get(s.panel.channelId);
    if (oldCh) {
      const old = await oldCh.messages.fetch(s.panel.messageId).catch(() => null);
      if (old) await old.delete().catch(() => {});
    }
  }
  let ch = channelId ? guild.channels.cache.get(channelId) : null;
  if (!ch && s.panelChannelId) ch = guild.channels.cache.get(s.panelChannelId);
  if (!ch) ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && /ticket|support|pagalba/.test(c.name));
  if (!ch) ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages));
  if (!ch) throw new Error('Nerastas kanalas panelei');
  await ch.permissionOverwrites.edit(guild.roles.everyone.id, { SendMessages: false, AddReactions: false }).catch(() => {});
  const msg = await ch.send({ embeds: [panelEmbed(s, guild)], components: panelRows() });
  s.panel = { channelId: ch.id, messageId: msg.id };
  saveDb();
  return ch.id;
}

/* ---------------- Nuotraukų persiuntimas į DM ---------------- */
const pendingAttach = {};

function registerHandlers(client) {
  client.on('messageCreate', async (msg) => {
    try {
      const p = pendingAttach[msg.channel.id];
      if (!p || msg.author.id !== p.staffId || msg.attachments.size === 0 || !msg.guild) return;
      delete pendingAttach[msg.channel.id];
      const s = dbGet();
      const owner = await msg.guild.members.fetch(p.ownerId).catch(() => null);
      if (!owner) return;
      try {
        await owner.send({ content: '📎 **Priedai nuo staff:**', files: msg.attachments.map(a => a.url) });
        await msg.channel.send({ embeds: [staffEmbed(s, msg.guild, '📎', 'Nuotraukos persiųstos', 'Klientas gavo **' + msg.attachments.size + '** priedą(-us) į DM ✅')] });
      } catch (e) {
        await msg.channel.send({ content: '❌ Nepavyko nusiųsti į DM — klientas uždaręs privačias žinutes.' });
      }
    } catch (e) { console.error('messageCreate klaida:', e); }
  });

  client.on('interactionCreate', async (i) => {
    try {
      const s = dbGet();
      if (i.isButton() && i.customId.startsWith('panel:')) {
        const catId = i.customId.split(':')[1];
        const modal = new ModalBuilder().setCustomId('m:new:' + catId).setTitle('Naujas bilietas');
        const input = new TextInputBuilder().setCustomId('question').setLabel('Aprašyk savo užklausą').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Pvz.: Noriu užsisakyti prekę...');
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return await i.showModal(modal);
      }
      if (i.isModalSubmit() && i.customId.startsWith('m:new:')) {
        const cat = CATEGORIES.find(c => c.id === i.customId.split(':')[2]);
        const q = i.fields.getTextInputValue('question');
        if (cat) return await createTicket(i, cat, q);
      }
      if (i.isButton() && i.customId.startsWith('t:')) {
        if (!isStaff(i)) return i.reply({ embeds: [staffEmbed(s, i.guild, '🚫', 'Tik staff komandai', 'Šie mygtukai skirti tik administracijai.\nTavo bilietą netrukus peržiūrės komanda. 🙏', 0xef4444)], ephemeral: true });
        const t = s.tickets[i.channel.id];
        switch (i.customId) {
          case 't:claim':
            if (t) { t.claimedBy = i.user.id; saveDb(); }
            return i.reply({ embeds: [staffEmbed(s, i.guild, '🙋', 'Ticketą apsiėmė', 'Staff: <@' + i.user.id + '>\nDabar jis atsakingas už šį bilietą.')] });
          case 't:paid':
            s.stats.apmoketi = (Number(s.stats.apmoketi) || 0) + 1; saveDb();
            return i.reply({ embeds: [staffEmbed(s, i.guild, '💰', 'Apmokėta', 'Apmokėjimas **patvirtintas** ✅\nUžsakymas ruošiamas.')] });
          case 't:send': {
            const modal = new ModalBuilder().setCustomId('m:send').setTitle('Siusti prekę');
            const input = new TextInputBuilder().setCustomId('info').setLabel('Informacija klientui').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Pvz.: prekės duomenys, prisijungimai, instrukcijos...');
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await i.showModal(modal);
          }
          case 't:done':
            s.stats.pristatyti = (Number(s.stats.pristatyti) || 0) + 1; saveDb();
            return i.reply({ embeds: [staffEmbed(s, i.guild, '✅', 'Atlikta', 'Darbas **baigtas**! Ačiū, kad naudojatės mūsų paslaugomis 💚')] });
          case 't:remind':
            return i.reply({ embeds: [staffEmbed(s, i.guild, '⏰', 'Priminimas', (t ? '<@' + t.userId + '>, ' : '') + 'prašome kuo greičiau **atsakyti** arba **atlikti apmokėjimą** 💳', 0xeab308)] });
          case 't:rename': {
            const modal = new ModalBuilder().setCustomId('m:rename').setTitle('Pervadinti ticketą');
            const input = new TextInputBuilder().setCustomId('name').setLabel('Naujas kanalo pavadinimas').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await i.showModal(modal);
          }
          case 't:info': {
            const e = baseEmbed(s, i.guild, 0x5865f2).setTitle('👤 │ Ticket info').addFields(
              { name: '🆔 Ticket ID', value: t ? '#' + t.id : '—', inline: true },
              { name: '👤 Klientas', value: t ? '<@' + t.userId + '>' : '—', inline: true },
              { name: '🗂️ Kategorija', value: t ? ((CATEGORIES.find(c => c.id === t.category) || {}).label || t.category) : '—', inline: true },
              { name: '📊 Statusas', value: t ? (t.status === 'open' ? '🟢 Atidarytas' : '🔒 Uždarytas') : '—', inline: true },
              { name: '🙋 Apsiėmė', value: t && t.claimedBy ? '<@' + t.claimedBy + '>' : '—', inline: true },
              { name: '📝 Užklausa', value: t && t.question ? t.question.slice(0, 1000) : '—', inline: false });
            return i.reply({ embeds: [e], ephemeral: true });
          }
          case 't:close':
            return await closeTicket(i);
        }
      }
      if (i.isModalSubmit() && i.customId === 'm:send') {
        const info = i.fields.getTextInputValue('info');
        const t = s.tickets[i.channel.id];
        let dmOk = false;
        if (t) {
          const owner = await i.guild.members.fetch(t.userId).catch(() => null);
          if (owner) {
            try { await owner.send({ embeds: [staffEmbed(s, i.guild, '📦', 'Tavo užsakymas / prekė', info)] }); dmOk = true; } catch (e) {}
          }
        }
        if (t && dmOk) {
          pendingAttach[i.channel.id] = { staffId: i.user.id, ownerId: t.userId };
          setTimeout(() => { delete pendingAttach[i.channel.id]; }, 120000);
        }
        return i.reply({ embeds: [staffEmbed(s, i.guild, '📦', 'Prekė išsiųsta',
          dmOk
            ? 'Informacija nusiųsta klientui į **DM** ✅\n\n📎 Nori pridėti nuotraukų? Įkelk jas **čia per 2 min** — automatiškai persiųsiu klientui į DM.'
            : '⚠️ Kliento DM uždaryti — informaciją paskelbsiu čia.',
          dmOk ? 0x22c55e : 0xeab308)] });
      }
      if (i.isStringSelectMenu() && i.customId === 't:quick') {
        if (!isStaff(i)) return i.reply({ embeds: [staffEmbed(s, i.guild, '🚫', 'Tik staff komandai', 'Šis meniu skirtas tik administracijai.', 0xef4444)], ephemeral: true });
        const q = quickMessages(s).find(x => x.value === i.values[0]);
        if (!q) return;
        if (q.value === 'refund-done') { s.stats.refund = (Number(s.stats.refund) || 0) + 1; saveDb(); }
        await i.channel.send({ embeds: [staffEmbed(s, i.guild, q.emoji, q.title, q.body, q.color)] });
        return i.reply({ content: '✅ Žinutė išsiųsta.', ephemeral: true });
      }
      if (i.isModalSubmit() && i.customId === 'm:rename') {
        const name = i.fields.getTextInputValue('name').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 90);
        await i.channel.setName(name);
        return i.reply({ content: '✏️ Kanalas pervadintas į **' + name + '**', ephemeral: true });
      }
    } catch (e) {
      console.error('Klaida:', e);
      if (i.isRepliable() && !i.replied && !i.deferred) i.reply({ content: '❌ Klaida: ' + String(e.message || e), ephemeral: true }).catch(() => {});
    }
  });
}

/* ---------------- Bot manager ---------------- */
const state = { status: 'stopped', error: null, startedAt: null };
let client = null, starting = false;
async function start() {
  if (client || starting) return state;
  const token = dbGet().token;
  if (!token) { state.status = 'no-token'; return state; }
  starting = true; state.status = 'starting'; state.error = null;
  client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  registerHandlers(client);
  client.once('ready', () => { state.status = 'online'; state.startedAt = Date.now(); starting = false; console.log('🟢 Botas online:', client.user.tag); });
  try { await client.login(token); }
  catch (e) { state.status = 'error'; state.error = String(e.message || e); client = null; starting = false; }
  return state;
}
async function stop() { if (client) { try { client.destroy(); } catch (e) {} } client = null; starting = false; state.status = 'stopped'; state.startedAt = null; }
function restart() { stop().then(start); }
function getClient() { return client; }
function getState() {
  const s = Object.assign({}, state);
  s.ping = client && client.ws ? client.ws.ping : null;
  s.guilds = client ? client.guilds.cache.size : 0;
  return s;
}

/* ---------------- WEB DASHBOARD (HTML) ---------------- */
const HTML = `<!doctype html>
<html lang="lt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>[Vault] Ticket System</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a100b;color:#e5e7eb;font-family:'Segoe UI',system-ui,sans-serif;padding:24px}
.wrap{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
.card{background:#0f1710;border:1px solid #1e2f21;border-radius:12px;padding:20px}
h1{font-size:26px}h2{font-size:14px;letter-spacing:1px;color:#4ade80;border-left:3px solid #22c55e;padding-left:10px;margin-bottom:16px}
.green{color:#4ade80}.muted{color:#8b9a8e;font-size:12px}
.head{display:flex;justify-content:space-between;gap:16px;border-left:4px solid #22c55e}
.head p{color:#9ca3af;font-size:14px;margin-top:6px;max-width:600px}
.head-right{display:flex;align-items:center;gap:12px}
.status{background:#0a120c;border:1px solid #1e2f21;border-radius:10px;padding:12px 16px;display:flex;gap:10px;align-items:flex-start;min-width:180px}
.dot{width:10px;height:10px;border-radius:50%;background:#ef4444;margin-top:5px}
.dot.on{background:#22c55e}.dot.warn{background:#eab308}
.status b{font-size:12px;letter-spacing:1px;color:#4ade80}
.btn{background:#22c55e;color:#052e0f;border:none;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;font-size:14px}
.btn:hover{background:#4ade80}
.btn.ghost{background:transparent;color:#4ade80;border:1px solid #22c55e}
.banner{background:#1a1a08;border:1px solid #854d0e;color:#fde68a;border-radius:10px;padding:14px 18px;font-size:14px}
.banner code{color:#4ade80}
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}
.stat{background:#0f1710;border:1px solid #1e2f21;border-radius:12px;padding:18px;text-align:center}
.stat b{display:block;font-size:24px;color:#22c55e}
.stat span{font-size:11px;letter-spacing:1px;color:#8b9a8e}
.cols{display:grid;grid-template-columns:1.2fr .9fr;gap:18px;align-items:start}
.col{display:flex;flex-direction:column;gap:18px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
label{display:flex;flex-direction:column;gap:6px;font-size:13px}
input,select{background:#0a120c;border:1px solid #23402a;border-radius:8px;padding:10px;color:#e5e7eb;font-size:14px;width:100%}
input:focus,select:focus{outline:none;border-color:#22c55e}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
@media(max-width:900px){.stats{grid-template-columns:repeat(3,1fr)}.cols{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wrap">
  <header class="card head">
    <div><h1><span class="green">[Vault]</span> Ticket System</h1>
      <p>Discord ticket botas: kategorijos, staff mygtukai, greitos žinutės, refund sistema ir pilna automatika.</p></div>
    <div class="head-right">
      <div class="status"><span class="dot" id="dot"></span>
        <div><b id="statusText">KRAUNAMA...</b><div class="muted" id="statusPing">—</div><div class="muted" id="statusUp">—</div></div></div>
      <button class="btn ghost" id="restartBtn">⟳ Restart</button>
    </div>
  </header>
  <div class="banner" id="apiBanner" hidden>Nepavyko pasiekti API. Jei atidarei failą atskirai, pridėk <code>?api=https://tavo-domenas.com</code></div>
  <section class="stats">
    <div class="stat"><b id="st-viso">0</b><span>VISO</span></div>
    <div class="stat"><b id="st-aktyvus">0</b><span>AKTYVŪS</span></div>
    <div class="stat"><b id="st-uzdaryti">0</b><span>UŽDARYTI</span></div>
    <div class="stat"><b id="st-apmoketi">0</b><span>APMOKĖTI</span></div>
    <div class="stat"><b id="st-pristatyti">0</b><span>PRISTATYTI</span></div>
    <div class="stat"><b id="st-refund">0</b><span>REFUND</span></div>
  </section>
  <section class="cols">
    <div class="card">
      <h2>NUSTATYMAI</h2>
      <div class="grid">
        <label>Boto pavadinimas<input id="f-botName"></label>
        <label>Savininko ID<input id="f-ownerId" placeholder="Discord user ID"></label>
        <label>Staff rolės ID<input id="f-staffRoleId"></label>
        <label>Ticket kategorijos ID<input id="f-ticketCategoryId"></label>
        <label>Uždarytų kategorijos ID<input id="f-closedCategoryId"></label>
        <label>Logų kanalo ID<input id="f-logChannelId"></label>
        <label>Ł LTC adresas<input id="f-ltc"></label>
        <label>₿ BTC adresas<input id="f-btc"></label>
        <label>◎ SOL adresas<input id="f-sol"></label>
        <label>Ξ ETH adresas<input id="f-eth"></label>
        <label>Max aktyvūs ticket<input id="f-maxActive" type="number" value="2"></label>
      </div>
      <button class="btn" id="saveSettings">Išsaugoti nustatymus</button> <span class="muted" id="saveMsg"></span>
    </div>
    <div class="col">
      <div class="card">
        <h2>BOTO TOKENAS</h2>
        <div class="row" style="margin-bottom:10px">
          <div class="muted">Dabartinis:<br><span id="tokenNow">—</span><br>Šaltinis: <span id="tokenSrc">...</span></div>
          <input id="f-token" type="password" placeholder="••••••••••••••••" style="flex:1">
          <button class="btn" id="saveToken">Išsaugoti + perleisti</button>
        </div>
        <div class="muted" id="tokenMsg" style="color:#4ade80">Saugoma ir perleidžiama...</div>
        <p class="muted" style="margin-top:8px">Tokenas saugomas duomenų bazėje, todėl išlieka net jei .env išsivalo.</p>
      </div>
      <div class="card">
        <h2>TICKET PANELĖ</h2>
        <div class="row">
          <select id="panelChannel" style="flex:1"><option value="">Automatiškai (ticket kanalas)</option></select>
          <button class="btn" id="sendPanel">Siųsti panelę</button>
          <span class="muted" id="panelMsg"></span>
        </div>
        <p class="muted" style="margin-top:10px">Sena panelė ištrinama, kanalas užrakinamas — nariai gali tik spausti mygtukus.</p>
      </div>
    </div>
  </section>
</div>
<script>
var apiBase = new URLSearchParams(location.search).get('api') || '';
function $(id){ return document.getElementById(id); }
function api(p, opts){
  return fetch(apiBase + p, opts).then(function(r){
    if(!r.ok) return r.text().then(function(t){ throw new Error(t); });
    return r.json();
  });
}
function poll(){
  api('/api/state').then(function(st){
    $('apiBanner').hidden = true;
    var txt = 'KRAUNAMA...', cls = '';
    if(st.status === 'online'){ txt = 'ONLINE'; cls = 'on'; }
    else if(st.status === 'starting'){ txt = 'PERLEIDŽIAMA...'; cls = 'warn'; }
    else if(st.status === 'stopped'){ txt = 'OFFLINE'; }
    else if(st.status === 'no-token'){ txt = 'NĖRA TOKENO'; }
    else if(st.status === 'error'){ txt = 'KLAIDA'; }
    $('statusText').textContent = txt;
    $('dot').className = 'dot ' + cls;
    $('statusPing').textContent = st.ping ? 'Ping: ' + st.ping + 'ms' : '—';
    $('statusUp').textContent = st.startedAt ? 'Nuo ' + new Date(st.startedAt).toLocaleTimeString() : '—';
    return api('/api/stats');
  }).then(function(stats){
    ['viso','aktyvus','uzdaryti','apmoketi','pristatyti','refund'].forEach(function(k){ $('st-' + k).textContent = stats[k] || 0; });
    return api('/api/settings');
  }).then(function(s){
    $('tokenNow').textContent = s.tokenSet ? '••••••••••••' : '—';
    $('tokenSrc').textContent = s.tokenSource || '—';
    return api('/api/channels');
  }).then(function(chs){
    var sel = $('panelChannel'); var cur = sel.value;
    var h = '<option value="">Automatiškai (ticket kanalas)</option>';
    chs.forEach(function(c){ h += '<option value="' + c.id + '">' + c.name + '</option>'; });
    sel.innerHTML = h; sel.value = cur;
  }).catch(function(){ $('apiBanner').hidden = false; });
}
$('saveSettings').onclick = function(){
  api('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
    botName: $('f-botName').value, ownerId: $('f-ownerId').value, staffRoleId: $('f-staffRoleId').value,
    ticketCategoryId: $('f-ticketCategoryId').value, closedCategoryId: $('f-closedCategoryId').value,
    logChannelId: $('f-logChannelId').value, maxActive: Number($('f-maxActive').value) || 2,
    addresses: { LTC: $('f-ltc').value, BTC: $('f-btc').value, SOL: $('f-sol').value, ETH: $('f-eth').value }
  })}).then(function(){ $('saveMsg').textContent = '✅ Išsaugota'; setTimeout(function(){ $('saveMsg').textContent = ''; }, 2500); });
};
$('saveToken').onclick = function(){
  $('tokenMsg').textContent = 'Saugoma ir perleidžiama...';
  api('/api/token', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token: $('f-token').value }) })
    .catch(function(e){ $('tokenMsg').textContent = '❌ ' + e.message; });
};
$('restartBtn').onclick = function(){ api('/api/restart', { method:'POST' }); };
$('sendPanel').onclick = function(){
  $('panelMsg').textContent = 'Siunčiama...';
  api('/api/panel', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ channelId: $('panelChannel').value }) })
    .then(function(){ $('panelMsg').textContent = '✅ Išsiųsta'; })
    .catch(function(e){ try { $('panelMsg').textContent = '❌ ' + JSON.parse(e.message).error; } catch(x){ $('panelMsg').textContent = '❌ ' + e.message; } });
  setTimeout(function(){ $('panelMsg').textContent = ''; }, 3000);
};
(function(){
  api('/api/settings').then(function(s){
    $('f-botName').value = s.botName || ''; $('f-ownerId').value = s.ownerId || '';
    $('f-staffRoleId').value = s.staffRoleId || ''; $('f-ticketCategoryId').value = s.ticketCategoryId || '';
    $('f-closedCategoryId').value = s.closedCategoryId || ''; $('f-logChannelId').value = s.logChannelId || '';
    $('f-maxActive').value = s.maxActive || 2;
    $('f-ltc').value = (s.addresses || {}).LTC || ''; $('f-btc').value = (s.addresses || {}).BTC || '';
    $('f-sol').value = (s.addresses || {}).SOL || ''; $('f-eth').value = (s.addresses || {}).ETH || '';
  }).catch(function(){});
  poll(); setInterval(poll, 3000);
})();
</script>
</body>
</html>`;

/* ---------------- WEB serveris ---------------- */
function readBody(req) {
  return new Promise(res => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch (e) { res({}); } }); });
}
function applySettings(b) {
  const s = dbGet();
  ['botName', 'ownerId', 'staffRoleId', 'ticketCategoryId', 'closedCategoryId', 'logChannelId', 'panelChannelId', 'maxActive'].forEach(k => { if (b[k] !== undefined) s[k] = b[k]; });
  if (b.addresses) s.addresses = Object.assign({}, s.addresses, b.addresses);
  saveDb();
}
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  try {
    if (req.method === 'GET' && u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(HTML); }
    if (req.method === 'GET' && u.pathname === '/api/state') return json(200, getState());
    if (req.method === 'GET' && u.pathname === '/api/stats') return json(200, dbGet().stats);
    if (req.method === 'GET' && u.pathname === '/api/settings') {
      const s = dbGet(); const rest = Object.assign({}, s);
      const tokenSet = !!rest.token;
      const tokenSource = rest.token ? (rest.token === process.env.TOKEN ? 'env' : 'db') : '—';
      delete rest.token; rest.tokenSet = tokenSet; rest.tokenSource = tokenSource;
      return json(200, rest);
    }
    if (req.method === 'GET' && u.pathname === '/api/channels') {
      const c = getClient();
      if (!c || !c.isReady()) return json(200, []);
      const out = [];
      c.guilds.cache.forEach(g => g.channels.cache.forEach(ch => { if (ch.type === 0) out.push({ id: ch.id, name: '#' + ch.name }); }));
      return json(200, out);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (u.pathname === '/api/settings') { applySettings(body); return json(200, { ok: true }); }
      if (u.pathname === '/api/token') {
        const t = String(body.token || '').trim();
        if (!t) return json(400, { ok: false, error: 'Tokenas tuščias' });
        dbSet({ token: t }); restart();
        return json(200, { ok: true });
      }
      if (u.pathname === '/api/restart') { restart(); return json(200, { ok: true }); }
      if (u.pathname === '/api/panel') {
        const c = getClient();
        if (!c || !c.isReady()) return json(400, { ok: false, error: 'Botas neprisijungęs' });
        try { return json(200, { ok: true, channelId: await sendPanel(c, body.channelId) }); }
        catch (e) { return json(400, { ok: false, error: String(e.message || e) }); }
      }
    }
    json(404, { error: 'Nerasta' });
  } catch (e) { json(500, { error: String(e.message || e) }); }
});

/* ---------------- START ---------------- */
process.on('unhandledRejection', e => console.error('unhandledRejection:', e));
loadDb();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(' Dashboard: http://localhost:' + PORT));
start();