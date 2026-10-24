import type { BotEvent, LocalizedLines } from '@chess/types';

/** Shared personalities; each bot speaks in one voice. */
export type Voice = 'cheerful' | 'brash' | 'calm' | 'gruff' | 'engine' | 'mystery';

type VoiceLines = Record<BotEvent, LocalizedLines>;

export const VOICES: Record<Voice, VoiceLines> = {
  cheerful: {
    'game-start': {
      en: ["Hi! Let's have a fun game.", 'Ready when you are!'],
      hinglish: ['Hello! Chalo ek mazedaar game khelte hain.', 'Main ready hoon, aap shuru karo!'],
    },
    'user-opening': {
      en: ['Ooh, I know this opening!', 'Nice start.'],
      hinglish: ['Arre, ye opening toh maine dekhi hai!', 'Accha start hai.'],
    },
    'captured-queen': {
      en: ['Whoa, I got your queen!', 'Was that queen a present?'],
      hinglish: ['Wah, aapki queen mil gayi!', 'Ye queen mere liye gift thi kya?'],
    },
    'lost-queen': {
      en: ['Oh no, my queen!', "I didn't see that coming."],
      hinglish: ['Arre nahi, meri queen!', 'Ye toh maine dekha hi nahi.'],
    },
    'in-check': {
      en: ['Eek, check!', 'Hey, leave my king alone!'],
      hinglish: ['Arre, check!', 'Mere king ko chhod do na!'],
    },
    winning: {
      en: ['I think I am doing well!', 'This is going nicely for me.'],
      hinglish: ['Lagta hai main accha khel raha hoon!', 'Mera game badhiya chal raha hai.'],
    },
    losing: {
      en: ["You're really good!", 'Hmm, this is getting hard.'],
      hinglish: ['Aap toh kaafi acche ho!', 'Hmm, ab mushkil ho rahi hai.'],
    },
    win: {
      en: ['Yay, I won! Good game!', 'Good game! Want a rematch?'],
      hinglish: ['Yay, main jeet gaya! Good game!', 'Good game! Ek aur khelein?'],
    },
    loss: {
      en: ['You won, well played!', 'Great game, you deserved it.'],
      hinglish: ['Aap jeet gaye, bahut accha khela!', 'Zabardast game, aap jeetne ke layak the.'],
    },
    draw: {
      en: ['A draw! That was close.', 'Nobody wins, nobody loses!'],
      hinglish: ['Draw! Kaafi close tha.', 'Na koi jeeta, na koi haara!'],
    },
  },
  brash: {
    'game-start': {
      en: ['My queen is coming for you.', 'Hope you like attacking chess!'],
      hinglish: [
        'Meri queen aa rahi hai aapke liye.',
        'Ummeed hai aapko attacking chess pasand hai!',
      ],
    },
    'user-opening': {
      en: ['Boring opening. Let me spice it up.', 'Theory? I prefer chaos.'],
      hinglish: [
        'Boring opening. Main thoda masala daalta hoon.',
        'Theory? Mujhe chaos pasand hai.',
      ],
    },
    'captured-queen': {
      en: ['Your queen is mine!', 'That is what happens when you get careless.'],
      hinglish: ['Aapki queen ab meri!', 'Laaparwahi ka yahi nateeja hota hai.'],
    },
    'lost-queen': {
      en: ['Fine. I did not need her anyway.', 'Lucky shot.'],
      hinglish: ['Theek hai. Mujhe waise bhi zaroorat nahi thi.', 'Kismat se mil gaya.'],
    },
    'in-check': {
      en: ['A check? Cute.', 'That will not save you.'],
      hinglish: ['Check? Kitna cute.', 'Isse aap bachoge nahi.'],
    },
    winning: {
      en: ['Feel the pressure yet?', 'This attack is unstoppable.'],
      hinglish: ['Pressure feel ho raha hai?', 'Ye attack ab nahi rukega.'],
    },
    losing: {
      en: ['Okay, okay, not bad.', 'I am just warming up.'],
      hinglish: ['Theek hai, bura nahi.', 'Main toh abhi warm up kar raha hoon.'],
    },
    win: {
      en: ['Told you the queen would win it.', 'Too easy. Again?'],
      hinglish: ['Bola tha na, queen hi jitayegi.', 'Bahut aasaan tha. Ek aur?'],
    },
    loss: {
      en: ['Rematch. Right now.', 'You got lucky this time.'],
      hinglish: ['Rematch. Abhi ke abhi.', 'Is baar aapki kismat acchi thi.'],
    },
    draw: {
      en: ['A draw? I wanted blood.', 'Fine, a draw. Next time I win.'],
      hinglish: ['Draw? Mujhe toh jeet chahiye thi.', 'Theek hai, draw. Agli baar main jeetunga.'],
    },
  },
  calm: {
    'game-start': {
      en: ['Good luck, and enjoy the game.', "Let's play a thoughtful game."],
      hinglish: ['Good luck, game enjoy karo.', 'Chalo soch-samajh kar khelte hain.'],
    },
    'user-opening': {
      en: ['A solid choice of opening.', 'Interesting opening. Let us see.'],
      hinglish: ['Solid opening chuni hai.', 'Interesting opening hai. Dekhte hain.'],
    },
    'captured-queen': {
      en: ['That queen was undefended.', 'Material matters. Thank you.'],
      hinglish: ['Wo queen bina protection ke thi.', 'Material important hai. Shukriya.'],
    },
    'lost-queen': {
      en: ['Well spotted.', 'I missed that. Nicely done.'],
      hinglish: ['Accha dekha aapne.', 'Ye mujhse miss ho gaya. Shabaash.'],
    },
    'in-check': {
      en: ['Check noted.', 'An active move.'],
      hinglish: ['Check, samajh gaya.', 'Active move hai.'],
    },
    winning: {
      en: ['The position favours me now.', 'Small advantages add up.'],
      hinglish: ['Ab position mere favour mein hai.', 'Chhote-chhote advantage judte jaate hain.'],
    },
    losing: {
      en: ['You are playing precisely.', 'I will need to defend carefully.'],
      hinglish: ['Aap bahut precise khel rahe ho.', 'Mujhe dhyan se defend karna hoga.'],
    },
    win: {
      en: ['Good game. Review it to see the turning point.', 'Thank you for the game.'],
      hinglish: ['Good game. Review karke turning point dekho.', 'Game ke liye shukriya.'],
    },
    loss: {
      en: ['Well played. You earned that.', 'Excellent game. Congratulations.'],
      hinglish: ['Bahut accha khela. Aapne ye jeet kamayi hai.', 'Shandaar game. Badhaai ho.'],
    },
    draw: {
      en: ['A fair result.', 'Balanced to the end.'],
      hinglish: ['Sahi nateeja hai.', 'Aakhir tak barabar ka game raha.'],
    },
  },
  gruff: {
    'game-start': {
      en: ["Let's get on with it.", "I've played ten thousand games. Show me something new."],
      hinglish: [
        'Chalo, shuru karte hain.',
        'Maine das hazaar games khele hain. Kuch naya dikhao.',
      ],
    },
    'user-opening': {
      en: ['Seen it.', 'Textbook. Predictable.'],
      hinglish: ['Dekha hua hai.', 'Kitaabi move. Predictable.'],
    },
    'captured-queen': {
      en: ['Sloppy.', 'Never leave your queen like that.'],
      hinglish: ['Laaparwahi.', 'Queen ko aise kabhi mat chhodo.'],
    },
    'lost-queen': {
      en: ['Hmph. Well found.', 'Even I blunder sometimes.'],
      hinglish: ['Hmm. Accha dhoondha.', 'Kabhi-kabhi main bhi blunder karta hoon.'],
    },
    'in-check': {
      en: ['Checks are not a plan.', 'Hmph.'],
      hinglish: ['Check dena plan nahi hota.', 'Hmm.'],
    },
    winning: {
      en: ['This endgame is mine.', 'Experience wins.'],
      hinglish: ['Ye endgame mera hai.', 'Experience jeetata hai.'],
    },
    losing: {
      en: ['Not bad, kid.', 'You have been studying.'],
      hinglish: ['Bura nahi, bachche.', 'Lagta hai aapne padhai ki hai.'],
    },
    win: {
      en: ['As expected.', 'Study your endgames.'],
      hinglish: ['Jaisa socha tha.', 'Endgames ki practice karo.'],
    },
    loss: {
      en: ['You earned it. Do not get used to it.', 'Hmph. Good game.'],
      hinglish: ['Aapne kamaya hai. Aadat mat daalna.', 'Hmm. Good game.'],
    },
    draw: {
      en: ['A draw. Acceptable.', 'Neither of us blundered. Respect.'],
      hinglish: ['Draw. Chalega.', 'Humme se kisi ne blunder nahi kiya. Respect.'],
    },
  },
  engine: {
    'game-start': {
      en: ['Initialising. Good luck.', 'Search depth: maximum.'],
      hinglish: ['Initialising. Good luck.', 'Search depth: maximum.'],
    },
    'user-opening': {
      en: ['Book position recognised.', 'Opening theory confirmed.'],
      hinglish: ['Book position pehchaan li.', 'Opening theory confirm hui.'],
    },
    'captured-queen': {
      en: ['Material: +9.', 'Queen captured. Evaluation updated.'],
      hinglish: ['Material: +9.', 'Queen capture hui. Evaluation update ho gaya.'],
    },
    'lost-queen': {
      en: ['Unexpected. Recalculating.', 'Sacrifice accepted?'],
      hinglish: ['Unexpected. Dobara calculate kar raha hoon.', 'Sacrifice accept kiya?'],
    },
    'in-check': {
      en: ['Check registered.', 'King relocation in progress.'],
      hinglish: ['Check register hua.', 'King ko shift kar raha hoon.'],
    },
    winning: {
      en: ['Evaluation: decisive.', 'Forced line found.'],
      hinglish: ['Evaluation: decisive.', 'Forced line mil gayi.'],
    },
    losing: {
      en: ['Evaluation error?', 'Impressive accuracy detected.'],
      hinglish: ['Evaluation mein galti?', 'Zabardast accuracy detect hui.'],
    },
    win: {
      en: ['Game over. Thank you for playing.', 'Result: 1 point.'],
      hinglish: ['Game over. Khelne ke liye shukriya.', 'Result: 1 point.'],
    },
    loss: {
      en: ['Error: opponent too strong.', 'Remarkable. Logging this game.'],
      hinglish: ['Error: opponent bahut strong hai.', 'Kamaal hai. Ye game log kar raha hoon.'],
    },
    draw: {
      en: ['Draw. Equilibrium maintained.', 'Result: half a point.'],
      hinglish: ['Draw. Balance bana raha.', 'Result: aadha point.'],
    },
  },
  mystery: {
    'game-start': {
      en: ['...', 'You seem confident. Interesting.'],
      hinglish: ['...', 'Aap confident lag rahe ho. Interesting.'],
    },
    'user-opening': {
      en: ['Everyone plays that at first.', 'I wonder how long you have prepared.'],
      hinglish: ['Shuru mein sab yahi khelte hain.', 'Pata nahi aapne kitni taiyaari ki hai.'],
    },
    'captured-queen': {
      en: ['Did you really want to give me that?', 'Oh dear.'],
      hinglish: ['Kya aap sach mein mujhe ye dena chahte the?', 'Oh ho.'],
    },
    'lost-queen': {
      en: ['Or did I let you take it?', 'Hmm. Keep going.'],
      hinglish: ['Ya maine aapko lene diya?', 'Hmm. Khelte raho.'],
    },
    'in-check': {
      en: ['A check. How bold.', 'You think that worries me?'],
      hinglish: ['Check. Kitni himmat.', 'Aapko lagta hai isse main pareshan hoonga?'],
    },
    winning: {
      en: ['You can still resign gracefully.', 'It is quieter than it looks.'],
      hinglish: [
        'Aap abhi bhi izzat se resign kar sakte ho.',
        'Jitna dikh raha hai, utna shaant nahi hai.',
      ],
    },
    losing: {
      en: ['Interesting.', 'Are you sure about that?'],
      hinglish: ['Interesting.', 'Aapko pakka yakeen hai?'],
    },
    win: {
      en: ['Did you think you were winning?', 'Until next time.'],
      hinglish: ['Kya aapko laga aap jeet rahe the?', 'Phir milenge.'],
    },
    loss: {
      en: ['Well. You found the way.', 'Remember this game.'],
      hinglish: ['Hmm. Aapne raasta dhoondh liya.', 'Ye game yaad rakhna.'],
    },
    draw: {
      en: ['A draw. For now.', 'We will meet again.'],
      hinglish: ['Draw. Abhi ke liye.', 'Hum phir milenge.'],
    },
  },
};
