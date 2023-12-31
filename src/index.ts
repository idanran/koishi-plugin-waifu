import { Context, Schema, h, Universal } from 'koishi'
import { randomSelect, isSameDay } from './utils'

export const name = 'waifu'

export interface Config {
  avoidNtr: boolean
}

export const Config: Schema<Config> = Schema.object({
  avoidNtr: Schema.boolean().default(false).description('避免用户抽中他人的老婆')
})

export function apply(ctx: Context, cfg: Config) {
  ctx.i18n.define('zh-CN', require('./locales/zh-CN'))

  const members: Map<string, Map<string, Universal.GuildMember>> = new Map()
  const marriages: Map<string, Universal.GuildMember & { marriageDate: number }> = new Map()

  ctx.guild().on('message-created', (session) => {
    const guildMembers = members.get(session.gid)
    if (guildMembers) {
      guildMembers.set(session.fid, session.event.member)
    } else {
      members.set(session.gid, new Map([[session.fid, session.event.member]]))
    }
  })

  ctx.on('guild-member-removed', (session) => {
    const guildMembers = members.get(session.gid)
    if (guildMembers) guildMembers.delete(session.fid)
  })

  ctx.guild().command('waifu', '娶群友')
    .alias('marry', '娶群友', '今日老婆')
    .action(async ({ session }) => {
      const marriage = marriages.get(session.fid)
      if (marriage && marriage.user.id !== session.userId && isSameDay(Date.now(), marriage.marriageDate)) {
        const selected = marriage
        return session.text('.marriages', {
          quote: h('quote', { id: session.messageId }),
          name: selected.nick || selected.user.nick || selected.user.name,
          avatar: h.image(selected.avatar || selected.user.avatar)
        })
      }

      let { data, next } = await session.bot.getGuildMemberList(session.guildId)
      if (next) {
        const memberList = await session.bot.getGuildMemberList(session.guildId, next)
        data = [...data, ...memberList.data]
      }
      const guildMembers = members.get(session.gid)
      if (data.length === 0 && guildMembers) {
        for (const [key, value] of guildMembers) {
          data.push(value)
        }
      } else if (guildMembers) {
        const map = new Map(data.map(v => {
          const fid = `${session.platform}:${session.guildId}:${v.user.id}`
          return [fid, v]
        }))
        members.set(session.gid, map)
      }

      const excludes = [
        session.userId,
        session.selfId
      ]
      const list = data.filter(v => !excludes.includes(v.user.id) && !v.user.isBot)
      if (list.length === 0) {
        return session.text('.members-too-few')
      }

      let selected = randomSelect(list)
      let selectedFid = `${session.platform}:${session.guildId}:${selected.user.id}`
      if (marriages.has(selectedFid)) {
        selected = randomSelect(list)
        selectedFid = `${session.platform}:${session.guildId}:${selected.user.id}`
      }
      if (cfg.avoidNtr) {
        let i = 0
        while (true) {
          if (marriages.has(selectedFid)) {
            selected = randomSelect(list)
            selectedFid = `${session.platform}:${session.guildId}:${selected.user.id}`
          } else {
            break
          }
          i++
          if (i > list.length) return session.text('.members-too-few')
        }
      }
      const marriageDate = Date.now()
      marriages.set(session.fid, { ...selected, marriageDate })
      marriages.set(selectedFid, { ...session.event.member, marriageDate })

      return session.text('.marriages', {
        quote: h('quote', { id: session.messageId }),
        name: selected.nick || selected.user.nick || selected.user.name,
        avatar: h.image(selected.avatar ?? selected.user.avatar)
      })
    })
}
