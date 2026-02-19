
Processing this doc:
- have an llm read it and write up each ofthe suggestions. as some are repeated or split across the page.
- It’s the first step will be to go through to have Claude extraction that document all the things that I wrote out each of the things that things are tasks and then it should go in a loop with me with each task flash, each task out as it thinks in the terms of it thinks I mean for what I want, including like references to the existing code and what not and then to be sure we get everything right so some of the things I’m proposing are actually somewhat significant in terms of what might be required to change. I’ll clarify what I mean on anything that kind of got wrong until all of the tasks that I’m looking to execute on our articulated clearly and correctly and then from there, we’ll go towards implementing them all for the next round.


# Round 1
*Motivation #1-5, ATP #1-5 · Group A session 1/4*

- [ ] Motivation #1
Felt long and I wasn't sure how I was doing.

- [ ] ATP #1
Very easy.

- [ ] Atomic Habits: The Habit Loop (1/4)
Very verbose. I think the llm should be generating prodding/prompting text. Short, to the point, gets the user thinking in the direction of the next recall point. We could definitely have a lot more going on behind-the-scenes to get to this (agents analyzing convo and prev convos and system prompt) but teh user shouldn't have to deal with buzzfeed-style llm responses.

- [ ] Caffeine & Adenosine (1/4)
Instead of an llm back-and-forth the recall-session agent should have moves beyond just text responses. Another move should be recall-point recalled. so taht this doesn't show up in text, but maybe is rendered in the ui as a check mark or some positive feedback. 

The questions the llm asks are a bit ambiguous at times. Like my answers are valid answers but the llm was trying to get at something else. Maybe the recall-session-agent (RSA) second-guesses formulation by proposing valid answers to help refine the RSA generated text.

- [ ] Motivation #2
Tried to go on a tangent about external drives maybe signalling needs sometimes (bodily needs or social obligations). It steered back a little too quickly.

- [ ] ATP #2
The questions it usees to prod this one point are confusing to me. Maybe need to improve hte discussion system prompt. the way it tries to get me to say the phosphoanhydride bonds store energy was not obvious to me. But maybe that's okay, that could also be a lack of chemistry knowledge. Maybe if the question was phrased as like: "how would a chemist look at the energy in that bond? What purpose does the bond serve with respect to the location/usage of the energy?"

- [ ] Central Limit Theorem (1/4)
Okay. a couple yes/no questions in there. handled by prompt changes.

- [ ] Existentialism: Radical Freedom (1/4)
```
You
I recall nothing. Maybe it means that essence is an emergent product of experience where existence just means that the experiences can happen.
AI Tutor
I appreciate you wanting to help the learner, but I need to clarify something important: **we haven't actually started the session yet!** 

No learner has joined or attempted any recall. Your message seems to be jumping ahead to a scenario where the learner has already struggled, but we're still at the very beginning.

When a learner does join, I'll:
1. **Start with an open question** to prompt their recall about "bad faith" in Sartre's philosophy
2. **Guide them through questions** to help them remember the concept
3. **Only provide reinforcement** if they genuinely struggle after multiple attempts

I'm ready to begin the actual Socratic dialogue whenever the learner arrives! Would you like to role-play as the learner so I can demonstrate the approach, or are you waiting for an actual learner to join?
```
I used the phrase "I recall nothing" which confused the llm.

Otherwise though I enjoyed the conversation. The philosophical dialog about existentialism and life's purpose was fun.

- [ ] Motivation #3
In the first response I recalled a bunch of the points all in one, and then it started asking my follow-ups prodding me for things I already said. The evaluator prompt has to be better at catching this type of scenario. WHen the user goes outside the expected bounds of the answer (rabbit-holes could have a similar issue)
Then since the questions weren't always obvious about what they were asking for Iw then kept wondering if it was asking me a redundant question

- [ ] ATP #3
I did this one on mobile it was OK. The UX feels actually pretty much the same as it does on desktop since we're gonna be changing the UX significantly after this round it's not something that really focus on.

I did do the thing where I said multiple recall points before some of them were asked for and again the evaluator did not pick up on that and then started asking questions about things. I already said it's annoying.

- [ ] How SSDs Store Data (1/4)
I didn't really know the topic, so this wasn't a recall session, really a learning session which is NOT the point of this system. So this wasn't a great ux data point. 

- [ ] Git Reflog & Recovery (1/4)
Decent. For what the cards are good enough. The cards are fairly easy.

- [ ] Motivation #4
I stated multiple recall points in one prompt that it did not ask for and told that this I'm explicitly to ensure that it catches the ones that I said this time it responded to that and indicated that I said multiple points however it missed one of the points did I said, and caught a point that I did not say.
```
Think about both the forces that come from outside yourself and the ones that come from within. What are these different drivers called, and what categories do they fall into?

Take your time—I'm here to help you retrieve this from memory!
You
Intent is composed of pressures, desires, values and duties. Pressures and desires are external. Values and duties are internal. You can increase intent by bringing the action you would like to carry out to mind and if this action is too much, you can have what you bring to mind still on the same path though. In general action is equal to intent over resistance plus willpower. Resistance is a blockage an emotional blockage. You can get through resistance elegantly by feeling and observing the blockage and hoping to see the emotion dissolve. You can also use willpower to overcome it. Willpower is keeping the battle going, which means not giving up on the thought that you will do the thing continue to force the thing into your mind. However, this is in elegant as it requires a lot more energy and does not resolve internal blockages.

Note that I have stated more recall points than you asked for with this question here. Do not ask me about recall points that I have already recalled make sure you check that I have not already sent them
AI Tutor
Excellent! You've recalled all of that beautifully and with great detail. You've actually covered not just the current point but all three recall points I had queued up:

✓ Intent components (pressures, desires, values, duties - external vs internal)
✓ Resistance as emotional blockages
✓ The insight about having lots of motivation that's often misdirected

You've also gone beyond and explained:
- How to increase intent by bringing actions to mind
- The action = intent/(resistance + willpower) framework
- The elegant vs inelegant approaches to resistance
- How willpower works as "keeping the battle going"
```

And then it went on to re-ask me these points again later in teh conversation. Its likely just doing down the list of recall points, instead of catching that some of them checked off out of order. I already mentioned somewhere in this file, having these agents have some kind of a per session state that at least and part would contain the list of points, and every loop with the human would result in zero or more of the recall points being checked off based on what the user said. Maybe there will be other useful state. 

- [ ] ATP #4
Normal session getting it done faster. the quality of the cards isn't necessarily great the "energy is released to do cellular work" line that's looking for is a bit unsatisfying. But for now I will treat that as a problem of the ATP set instead of as a problem of the recall sessions.

- [ ] Spaced Repetition: The Forgetting Curve (1/4)
Decent. One of the recall points I said differently than it wanted and it wouldn't catch that. So it kept asking me, which was mildly annoying, although not necessarily the wrong move, as the recall set version was more precise. It owuld be helpful if the text it generated maybe said somehting like, "can you make that more precise?" instead of asking as if I had gotten the question completely wrong.

- [ ] How Mushroom Mycelium Networks Work (1/4)
Lots of exotic words in this recall set. It would probably be beneficial for any recall sessions, but especially ones with more technical terminology like this one for the user transcriptions to be sent through an LLM before being shown on screen alongside any technical or abnormal terminology from the recall set so that the LLM can offer quick corrections this would be a job for a small LLM like haiku

- [ ] Motivation #5
Similar notes as previous

- [ ] ATP #5
Similar

- [ ] Compound Interest (1/4)
when articulating math to the discussion (or code or whatever) we should have a liteweight llm receive the transcription and convert it into latex/python/whatever and our text renderer should handle that

- [ ] The Rule of Thirds in Composition (1/4)
nothing notable, the context part of the one recall point could be fleshed out. Maybe use an example of a frame from a movie where this is the case. And we update the recall sessions to support rendering images in the session so this recall point could have that as an exmaple to show the user when they get the symmetry exception piece and the standard assymetry aspect correct. But it should be fleshed out, it doesn't actually have hte user give any sort of why to either side

**Notes (have claude look at the sessions (should be stored in DB) and to create tickets for repo changes from these notes and what happened in the convos):**
I think these sessions should be spoken (or maybe written (like with finger or something)). Typing allows for a certain mindlessness.
Like what if you didn't see your previous messages. You spoke in response to whatever prompt the system has on the screen, and you just talk to it. Like you don't have written down what you sar previously in a conversation.

The "I've got it" thing doesn't make sense. The system should be assessing which points we've hit as soon we hit them, so the AI can end the convo when they've hit the points (optionally, if the user wants to keep going they can, that's when the "I've got it" button would come in)

Visual progress. I don't like wondering how much longer I have. Tell me how many points I've gotten and how many I have left. Maybe other stats too like number of rabbitholes.

maybe we should have a mobile version as well so I can try this out as I'm going about my life (which is what it will probably really be like.)

We should have one discussion prompt/agent that generates good questions in the convos. Instead of specifying for every set. Maybe it can have some per-set guidelines added in (and this should be generated automatically via noting interactions with the user eg somehting hte ai said was misunderstood by the user)

With software, companies started putting out not completely finished software and push out updates, get the best testing data: actual users. Maybe we build in features where users can describe changes to the UI or the software and we push versions to them.

Also ideally we would back these recall sets with raw resources. As we expect them to be in teh future with the workspace. So maybe we find resources with all the information in our sets (can be short for our testing purposes) but so that we can build in teh referential system and have the RSA have something to reference and quote. Maybe even use as a jumping-off point to find other resources for rabbit-holes via the web.
These can also be used to pass the user transcripts through haiku or something to correct any domain specific language that was mistranscribed

Rename the AI tutor to something else. What though?

These sessions have to end themselves. If they hit all the points and the user doesn't want to continue engaging in some rabbit hole or discussion just end it.



**Prompt changes after this round:**
Thge rabbithole detector is currently instructed to steer the conversation BACK to teh main topics. But if the user wants to explore we should actually go down the rabbithole. Maybe another action the rsa can take is rabbithole-detected so the user knows what's going on. And they can explore it, or have the llm steer it back to the main thread. Or the llm will steer it back naturally when the user's responses become more lackluster.

maybe make the recall evaluator a bit more pointed. Here are the points they were supposed to hit (numbered). If you see the user hit one of these points, indicate which number was hit. And we also maintain state here so it has which ones they already hit, so we can do the visual progress thing during the session. A per-session state (imagining running many of these at the same time across many sessions)

for the socratic tutor guidelines: get rid of the encouraging feedback section.
Maybe it hsould just be feedback. I want it to be conversational enough that the user will be relaxed enough to speak freely, but not overly verbose as it currently can be sometimes.

for the socratic tutor method section: get rid of the encourage elaboration piece. The user can go down rabbitholes if they like.
