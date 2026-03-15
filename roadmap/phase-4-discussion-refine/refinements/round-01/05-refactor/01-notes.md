
The core idea here is to make the underlying data structure basically a sequence of events a lot like Claude codes containing:
 - timestamp 
 - uuid
 - parentUuid
 - cwd
 - sessionId
 - gitBranch
 - branchId (for 'branch-agent')
 - type (tells how to parse the event, could be 'tutor-agent', 'branch-agent', 'analysis' (standin for recall-eval/branch-detection which are basically just prompts with simple strucutred output, almost like hooks, but not quite))
 - message:
    - type (differentiating potentially between different message structures for things like tool call results, or an evaluation, or an actual message from the user, or a previous context window, or whatever)
    - role (can be user, assistant, or system) (many context window injections will go into user messages eg tool call results, evaluation feedback, etc)
    - content (quite possibly mapped to its own json with type field)

what else was I planning to do before round 2?
 - exchange-the-agents-add-to goes in an initial user mssage NOT system message as current
 - reorg a bit. the llm-agent separation ain't it. all for an agent should go toegether (unless shared, like the anthropicclient class)
 - no new agent for every branch. instead more of a queue where teh state of every branch (incl main branch) is sufficient to be passed to an agent process and have it produce whatever needs to be produced.

So the core underline structure is this sequence of events that can be chained together using the parent UI's and potentially have offshoot branches which will be hooked back into the main chain with a parent UUID. Using this underlying data structure we can then have the different agents that need to handle this differently, derive their context window however is needed for their purposes.
 - eg tutor puts exchange and maybe eval in an initial user message with instructions to construct the next message or something
 - branch agent gets the exchange as an actual exchange maybe? or same thing just appending down its branch as opposed to staying on main thread.
In addition, we persist the event sequences in postgres tables with columns for metadata then payload jsonb columns so the tables aren't overnormalized. Then we store raw jsonl in s3 storage.

So we need core/agents/<agent> directories
And we need new stuff in storage/... for the new stuff

session engine will hold the current session's event chain in-memory to manage processing. having agent utility funciotns assembling context window from the underlying data structure as needed

event types:
user-message-main: analysis-hooks
user-message-branch: call branch-agent on the branch's context window
branch-detection-result: if detection, create new branches for topic(s), else do nothing.
recall-eval-result: if recalled point(s) mark them recalled, evaluation (commentary on the quality of recall and if there are points the user almost has but not quite and what they are missing.)
tutor-agent-message: surface in UI to user
branch-agent-message: surface in UI to user

Analysis hooks:
recall-evaluation
branch-detection

THis is incomplete what else?


