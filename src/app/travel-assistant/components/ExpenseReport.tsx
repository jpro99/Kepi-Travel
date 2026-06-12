"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from './Camera';

interface TripExpense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: string;
}

interface ExpenseReportProps {
  tripId: string;
}

export function ExpenseReport({ tripId }: ExpenseReportProps) {
    const [expenses, setExpenses] = useState<TripExpense[]>([]);
    const [showCamera, setShowCamera] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const fetchExpenses = async () => {
            const response = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tripId }),
            });
            const data = await response.json();
            setExpenses(data.expenses);
        };

        fetchExpenses();
    }, [tripId]);

    const exportToCsv = () => {
        const headers = ['Date', 'Category', 'Description', 'Amount'];
        const csv = [
            headers.join(','),
            ...expenses.map((row) => [row.date, row.category, row.description, row.amount].join(",")),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'expenses.csv';
        a.click();
    };

    const handleCapture = async (dataUrl: string) => {
        setShowCamera(false);

        const response = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: dataUrl }),
        });

        if (response.ok) {
            const { expense } = await response.json();
            setExpenses(prevExpenses => [...prevExpenses, expense]);
        }
    };

    useEffect(() => {
        (window as any).handleCapture = handleCapture;
    }, [handleCapture]);

    return (
        <div className="rounded-3xl bg-white p-6 shadow-lg dark:bg-slate-900">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Expense Report</h2>
                <div className="flex items-center gap-x-4">
                    <button onClick={() => router.push(`/recovery/${tripId}`)} className="rounded-full bg-green-200 px-4 py-2 text-sm font-semibold text-green-900 hover:bg-green-300 dark:bg-green-800 dark:text-white dark:hover:bg-green-700">Recovery Plan</button>
                    <button onClick={() => router.push(`/share/mock-token`)} className="rounded-full bg-blue-200 px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-300 dark:bg-blue-800 dark:text-white dark:hover:bg-blue-700">Share Trip</button>
                    <button onClick={() => setShowCamera(true)} className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700">Add Receipt</button>
                    <button onClick={exportToCsv} className="rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700">Export to CSV</button>
                </div>
            </div>
            <table className="mt-4 w-full text-left">
                <thead>
                    <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Category</th>
                        <th className="p-2">Description</th>
                        <th className="p-2">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {expenses.map(expense => (
                        <tr key={expense.id}>
                            <td className="p-2">{expense.date}</td>
                            <td className="p-2">{expense.category}</td>
                            <td className="p-2">{expense.description}</td>
                            <td className="p-2">{expense.amount}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {showCamera && <Camera onCapture={handleCapture} onCancel={() => setShowCamera(false)} />}
        </div>
    );
}
