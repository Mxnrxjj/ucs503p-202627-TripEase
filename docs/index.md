![Tiet Logo](assets/tiet-logo.svg){ .tiet-logo }

**UCS503: Software Engineering (Project)**  
**TIET Patiala**

# TripEase

**Author(s)**:

Nimitt Malhotra (1024030709), Manraj Singh (1024030712) and Vatsal Chauhan (1024030714)

TripEase is a web application for planning a trip in one place. Normally a group's plan is spread across a chat, a notes app, a maps app and a spreadsheet, and nobody knows which copy is the latest. In TripEase a trip is a single record that holds the itinerary, the places on a map and the budget together, and all of them update when the traveller edits the plan.

The project is at the mid-semester stage. The working prototype has sign-in, a new-trip wizard, city planning with an AI provider and a rule-based fallback, day-by-day itinerary generation, an editable roadmap, a map, feasibility checks and a budget with saving suggestions. The full list is in the [README](https://github.com/Mxnrxjj/ucs503p-202627-TripEase#readme).

## Documentation

| Page | Contents |
|---|---|
| [Requirements](requirements.md) | Functional and non-functional requirements, with their status |
| [Data Model](data-model.md) | ER diagram in Chen notation and how a trip is stored in Firestore |
| [Diagrams](diagrams.md) | Architecture and data flow diagrams |
| [Use Cases](use-cases.md) | Use case diagram and a description of every use case |
| [Activity Diagram](activity-diagram.md) | The steps of creating a trip, from the wizard to the saved trip |
| [Journals](journals/index.md) | Weekly journals of the team members |

## Running the application

The application is in the `code` folder. You need Node.js 22 or newer.

``` shell
cd code
npm install
cp .env.example .env.local     # then fill in the Firebase web configuration
npm run dev                    # http://localhost:3000
```

The full setup, including creating the Firebase project and the optional Google Places and Groq keys, is described in [`code/README.md`](https://github.com/Mxnrxjj/ucs503p-202627-TripEase/blob/main/code/README.md).
