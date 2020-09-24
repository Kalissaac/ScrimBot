module.exports = exports = {
  name: 'matchReactions',
  enabled: true,
  process: async (GLOBALS) => {
    addOldMessagesToCache(GLOBALS)

    GLOBALS.client.on('messageReactionAdd', (reaction, user) => {
      if (user.bot) return // ignore messages from the bot itself or other bots
      if (['🇦', '🇧', '🇸'].includes(reaction.emoji.name) === false) return // ignore reactions that are not team reactions
      addPlayerToMatch(reaction, user, GLOBALS)
    })
    GLOBALS.client.on('messageReactionRemove', async (reaction, user) => {
      if (user.bot) return // ignore messages from the bot itself or other bots
      if (['🇦', '🇧', '🇸'].includes(reaction.emoji.name) === false) return // ignore reactions that are not team reactions
      removePlayerFromMatch(reaction, user, GLOBALS)
    })
  }
}

const addOldMessagesToCache = async (GLOBALS) => {
  const snapshot = await GLOBALS.db.collection('matches').where('status', '==', 'created').get()
  if (snapshot.empty) return // no open matches found

  snapshot.forEach(async doc => {
    const match = doc.data()

    try {
      const messageChannel = await GLOBALS.client.channels.fetch(match.message.channel) // grab channel of match message
      await messageChannel.messages.fetch(match.message.id) // grab the match message itself, so that when people react the bot is able to see it
    } catch (error) {} // The only errors this really gives is when the bot no longer has access to channels
  })
}

const _addPlayerToMatch = async (reaction, user, GLOBALS, matchInformation) => {
  const playerInformationRef = GLOBALS.db.collection('users').doc(user.id)
  let playerInformation = await playerInformationRef.get()
  if (!playerInformation.exists) {
    reaction.message.channel.send(`${user}, you are not registered with ScrimBot. Please type \`v!register\` before reacting!`).then(msg => msg.delete({ timeout: 5000 }))
    reaction.users.remove(user.id)
    return
  }
  playerInformation = playerInformation.data()

  if (matchInformation.players.a.find(e => e.id === playerInformationRef.id)) {
    if (!reaction.message.guild.me.hasPermission('MANAGE_MESSAGES')) {
      reaction.message.channel.send(`${user}, you have already joined a team! Please remove that reaction before joining a new one.`).then(msg => msg.delete({ timeout: 5000 }))
      reaction.users.remove(user.id)
      return
    } else {
      matchInformation = await _removePlayerFromMatch(await reaction.message.reactions.cache.get('🇦'), user, GLOBALS, matchInformation)
    }
  } else if (matchInformation.players.b.find(e => e.id === playerInformationRef.id)) {
    if (!reaction.message.guild.me.hasPermission('MANAGE_MESSAGES')) {
      reaction.message.channel.send(`${user}, you have already joined a team! Please remove that reaction before joining a new one.`).then(msg => msg.delete({ timeout: 5000 }))
      reaction.users.remove(user.id)
      return
    } else {
      matchInformation = await _removePlayerFromMatch(await reaction.message.reactions.cache.get('🇧'), user, GLOBALS, matchInformation)
    }
  } else if (matchInformation.spectators && matchInformation.spectators.find(e => e.id === playerInformationRef.id)) {
    if (!reaction.message.guild.me.hasPermission('MANAGE_MESSAGES')) {
      reaction.message.channel.send(`${user}, you have already joined a team! Please remove that reaction before joining a new one.`).then(msg => msg.delete({ timeout: 5000 }))
      reaction.users.remove(user.id)
      return
    } else {
      matchInformation = await _removePlayerFromMatch(await reaction.message.reactions.cache.get('🇸'), user, GLOBALS, matchInformation)
    }
  }

  const messageEmbed = reaction.message.embeds[0]

  switch (reaction.emoji.name) {
    case '🇦': // team a
      if (matchInformation.players.a.length >= matchInformation.maxTeamCount) {
        reaction.message.channel.send(`${user}, the selected team is full! Please choose a different one.`).then(msg => msg.delete({ timeout: 5000 }))
      }
      if (playerInformation.valorantRank < matchInformation.rankMinimum || playerInformation.valorantRank > matchInformation.rankMaximum) {
        reaction.message.channel.send(`${user}, you do not meet the match rank requirements! Please try a different one or ask the match creator to adjust them.`).then(msg => msg.delete({ timeout: 5000 }))
        reaction.users.remove(user.id)
        return
      } else {
        messageEmbed.fields[6].value === 'None' ? messageEmbed.fields[6].value = `• ${playerInformation.valorantUsername}` : messageEmbed.fields[6].value += `\n• ${playerInformation.valorantUsername}`
        matchInformation.players.a.push(playerInformationRef)
        break
      }
    case '🇧': // team b
      if (matchInformation.players.b.length >= matchInformation.maxTeamCount) {
        reaction.message.channel.send(`${user}, the selected team is full! Please choose a different one.`).then(msg => msg.delete({ timeout: 5000 }))
      }
      if (playerInformation.valorantRank < matchInformation.rankMinimum || playerInformation.valorantRank > matchInformation.rankMaximum) {
        reaction.message.channel.send(`${user}, you do not meet the match rank requirements! Please try a different one or ask the match creator to adjust them.`).then(msg => msg.delete({ timeout: 5000 }))
        reaction.users.remove(user.id)
        return
      } else {
        messageEmbed.fields[7].value === 'None' ? messageEmbed.fields[7].value = `• ${playerInformation.valorantUsername}` : messageEmbed.fields[7].value += `\n• ${playerInformation.valorantUsername}`
        matchInformation.players.b.push(playerInformationRef)
        break
      }
    case '🇸': // spectators
      if (!matchInformation.spectators) {
        reaction.message.channel.send(`${user}, this match does not allow spectators! Either join a team or ask the match creator to start a new one.`).then(msg => msg.delete({ timeout: 5000 }))
        reaction.users.remove(user.id)
        return
      } else {
        messageEmbed.fields[8].value === 'None' ? messageEmbed.fields[8].value = `• ${playerInformation.valorantUsername}` : messageEmbed.fields[8].value += `\n• ${playerInformation.valorantUsername}`
        matchInformation.spectators.push(playerInformationRef)
        break
      }
  }

  reaction.message.edit(messageEmbed)
  return matchInformation
}

const addPlayerToMatch = async (reaction, user, GLOBALS) => {
  const matchInformationRef = GLOBALS.db.collection('matches').doc(reaction.message.id)
  let matchInformation = await matchInformationRef.get()
  if (!matchInformation.exists) return
  matchInformation = matchInformation.data()
  if (matchInformation.status !== 'created') return // only pay attention to matches that are still in the creation phase
  matchInformation = await _addPlayerToMatch(reaction, user, GLOBALS, matchInformation)
  matchInformationRef.update(matchInformation)
}

const _removePlayerFromMatch = async (reaction, user, GLOBALS, matchInformation) => {
  const playerInformationRef = GLOBALS.db.collection('users').doc(user.id)
  let playerInformation = await playerInformationRef.get()
  if (!playerInformation.exists) return
  playerInformation = playerInformation.data()

  const messageEmbed = reaction.message.embeds[0]

  let playersArrayIndex
  switch (reaction.emoji.name) {
    case '🇦':
      playersArrayIndex = matchInformation.players.a.findIndex(e => e.id === playerInformationRef.id)
      if (playersArrayIndex > -1) matchInformation.players.a.splice(playersArrayIndex, 1)

      messageEmbed.fields[6].value = ''
      for (const playerRef of matchInformation.players.a) {
        let playerDoc = await playerRef.get()
        playerDoc = playerDoc.data()
        messageEmbed.fields[6].value += `\n• ${playerDoc.valorantUsername}`
      }
      if (messageEmbed.fields[6].value === '') messageEmbed.fields[6].value = 'None'
      break
    case '🇧':
      playersArrayIndex = matchInformation.players.b.findIndex(e => e.id === playerInformationRef.id)
      if (playersArrayIndex > -1) matchInformation.players.b.splice(playersArrayIndex, 1)

      messageEmbed.fields[7].value = ''
      for (const playerRef of matchInformation.players.b) {
        let playerDoc = await playerRef.get()
        playerDoc = playerDoc.data()
        messageEmbed.fields[7].value += `\n• ${playerDoc.valorantUsername}`
      }
      if (messageEmbed.fields[7].value === '') messageEmbed.fields[7].value = 'None'
      break
    case '🇸':
      if (matchInformation.spectators) {
        playersArrayIndex = matchInformation.spectators.findIndex(e => e.id === playerInformationRef.id)
        if (playersArrayIndex > -1) matchInformation.spectators.splice(playersArrayIndex, 1)

        messageEmbed.fields[8].value = ''
        for (const playerRef of matchInformation.spectators) {
          let playerDoc = await playerRef.get()
          playerDoc = playerDoc.data()
          messageEmbed.fields[8].value += `\n• ${playerDoc.valorantUsername}`
        }
        if (messageEmbed.fields[8].value === '') messageEmbed.fields[8].value = 'None'
      }
      break
  }

  reaction.users.remove(user.id)
  reaction.message.edit(messageEmbed)
  return matchInformation
}

const removePlayerFromMatch = async (reaction, user, GLOBALS) => {
  const matchInformationRef = GLOBALS.db.collection('matches').doc(reaction.message.id)
  let matchInformation = await matchInformationRef.get()
  if (!matchInformation.exists) return
  matchInformation = matchInformation.data()
  if (matchInformation.status !== 'created') return
  matchInformation = await _removePlayerFromMatch(reaction, user, GLOBALS, matchInformation)
  matchInformationRef.update(matchInformation)
}
