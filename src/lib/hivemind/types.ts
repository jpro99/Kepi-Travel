import "server-only";

// This interface defines the core data structures for the Hivemind Itinerary.

export interface HivemindGroup {
    // A unique ID for this travel group.
    groupId: string;

    // The name of the group (e.g., "The Smith Family Vacation").
    groupName: string;

    // The user IDs of the members of the group.
    memberUserIds: string[];

    // The shared trip itinerary.
    sharedItineraryId: string;

    // The shared trip wallet for managing group expenses.
    sharedWallet: SharedWallet;

    // The current active decision polls for the group.
    activePolls: DecisionPoll[];
}

export interface SharedWallet {
    // The current balance of the wallet (can be negative).
    balance: number;

    // A ledger of all transactions within the group.
    ledger: Transaction[];

    // A summary of who owes what to whom.
    settlement: {
        [fromUserId: string]: {
            [toUserId: string]: number;
        }
    };
}

export interface Transaction {
    transactionId: string;
    paidBy: string; // The user ID of the person who paid
    amount: number;
    description: string;
    participants: string[]; // The user IDs of those who participated in the expense
}

export interface DecisionPoll {
    pollId: string;
    title: string; // e.g., "Where should we go for dinner?"
    options: {
        optionId: string;
        description: string;
        votes: string[]; // The user IDs of those who voted for this option
    };
    status: "open" | "closed";
}
