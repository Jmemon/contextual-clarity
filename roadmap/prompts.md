
When going beyond phase 3, two big llm-driven buckets beyond implementation.
 - *create plan*: new plans with self-contained tasks (assuming prereq tasks implemented) grouped into parallel-groups of tasks that can be executed in parallel by a swarm of subagents.
 - *update plan*: update previously existing later-phase plans that are being moved around or have to take into account things they didn't need to take into account when they were initially created.

**Create Plan**
broken down into self-contained tasks
executable completely in-isolation
assuming prerequisite tasks have been implemented.
Task dependency graphs and parallel-executable task-groups (executable in parallel by a swarm of subagents)

**Update Plan**
TBD


**Running Tests**
generally speaking, when tests fail and you need to make a change, use the AskUserQuestion tool to decide if the test should be updated or fi the code itself should be updated
