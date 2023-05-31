type Task = { name: string, expression: string, callBack: () => void, comment?: string, maxRuns?: number }
export type TaskInfo = { name: string, expression: string, comment: string, lastRun: null | Date, countRuns: number, maxRuns?: number}

type StoredTask = Task & TaskInfo & {
    min: number[],
    hour: number[],
    day: number[],
    month: number[],
    weekday: number[],
    year: null | number[]
}

//
//   Expression :
//
//   *  *  *  *  *  *
//   |  |  |  |  |  |
//   |  |  |  |  |  +----- year (2020 - 2099) (optional)
//   |  |  |  |  +----- weekday (0 - 6) (Sunday = 0)
//   |  |  |  +----- month (1 - 12)
//   |  |  +----- day of month (1 - 31)
//   |  +----- hour (0 - 23)
//   +----- minute (0 - 59)
//
//   Values may be expressed as single (9), multiple (1,4,5), range (3-6), all (*) or a combination of "," and "-" (1,4,6-9).
//
//   Ex:
//   0,15,30,45   0-6   *   *   1-4
//   Will run every quarter of an hour between midnight and 6 am monday to friday
//

const tasks: StoredTask[] = [];
let runner: NodeJS.Timeout | null = null;

const start = () => {
    // remove any running timeouts/intervals
    stop();
    // setting timeouts/intervales
    runner = setTimeout(() => {
        tick();
    }, (60 - new Date().getSeconds()) * 1000);
};

const stop = () => {
    // remove any running timeouts/intervals
    if (runner !== null) {
        clearTimeout(runner);
    }
};

const addTask = (task: Task) => {
    const exp = task.expression.replace(/ +/g, ' ').trim().split(' ');
    try {
        if (exp.length > 6 || exp.length < 5) {
            throw new Error('Invalid expression');
        }
        const newTask: StoredTask = {
            name: task.name,
            expression: task.expression,
            comment: task.comment ?? '',
            min: parseTimeExpression(exp[0], 0, 59) ?? [],
            hour: parseTimeExpression(exp[1], 0, 23) ?? [],
            day: parseTimeExpression(exp[2], 1, 31) ?? [],
            month: parseTimeExpression(exp[3], 1, 12) ?? [],
            weekday: parseTimeExpression(exp[4], 0, 6) ?? [],
            year: exp.length >= 6 ? parseTimeExpression(exp[5], 2020, 2099) ?? null : null,
            lastRun: null,
            countRuns: 0,
            maxRuns: task.maxRuns,
            callBack: task.callBack
        };
        tasks.push(newTask);
        // start crons if not already running
        if (!runner) {
            start();
        }
    } catch (err) {
        if (err instanceof Error && err.message === 'Invalid expression') {
            err.message = `Invalid cron expression '${task.expression}' for task '${task.name}'`;
            err.name = 'SyntaxError';
        }
        throw err;
    }
};

const removeTask = (name: string) => {
    const idx = tasks.findIndex(item => item.name === name);
    if (idx > -1) {
        tasks.splice(idx, 1);
    }
};

const getTasks = (): TaskInfo[] => {
    const retArr: TaskInfo[] = [];
    tasks.forEach(task => {
        retArr.push({
            name: task.name,
            expression: task.expression,
            comment: task.comment,
            lastRun: task.lastRun,
            maxRuns: task.maxRuns,
            countRuns: task.countRuns
        });
    });
    return retArr;
};

const parseTimeExpression = (timeExpression: string, min: number, max : number): null|number[] => {
    let retVal:number[] = [];
    let ok = false;
    if (timeExpression === '*') {
        for (let i = min; i <= max; i++) {
            retVal.push(i);
        }
        ok = true;
    }
    if (!ok && /^[0-9]+$/.test(timeExpression)) {
        const val = parseInt(timeExpression, 10);
        if (val >= min && val <= max) {
            retVal.push(val);
            ok = true;
        }
    }
    if (!ok && /^[0-9]+-[0-9]+$/.test(timeExpression)) {
        const arr = timeExpression.split('-');
        const mn = parseInt(arr[0], 10);
        const mx = parseInt(arr[1], 10);
        if (mn >= min && mx <= max && mx > mn) {
            for (let i = mn; i <= mx; i++) {
                retVal.push(i);
            }
            ok = true;
        }
    }
    if (!ok && /^[0-9-]+(,([0-9-]+))+$/.test(timeExpression)) {
        const arr = timeExpression.split(',');
        ok = arr.every(value => {
            try {
                const values = parseTimeExpression(value, min, max);
                if (values === null) {
                    return false;
                }
                retVal = [...retVal, ...values];
                return true;
            } catch {
                return false;
            }
        });
    }
    if (ok) {
        return [...new Set(retVal)].sort((a, b) => a - b);
    }
    throw new Error(`Invalid expression: ${timeExpression}`);
};

const existsInArray = (arr: number[], value: number): boolean => {
    // search for a value in an ascending sorted array
    if (arr.length < 10) {
        return arr.includes(value);
    }
    if (arr[0] < value || arr[arr.length - 1] > value) {
        return false;
    }
    let minIdx = 0;
    let maxIdx = arr.length - 1;
    while (minIdx <= maxIdx) {
        const midIdx = Math.floor((minIdx + maxIdx) / 2);
        const testResult = value - arr[midIdx];
        if (testResult < 0) {
            maxIdx = midIdx - 1;
        } else if (testResult > 0) {
            minIdx = midIdx + 1;
        } else if (testResult === 0) {
            return true;
        } else {
            break;
        }
    }
    return false;
};

const tick = () => {
    const d = new Date();
    runner = setTimeout(() => {
        tick();
    }, (60 - d.getSeconds()) * 1000);
    const now: Partial<Record<keyof StoredTask, number>> = {
        min: d.getMinutes() + d.getSeconds() > 50 ? 1 : 0,
        hour: d.getHours(),
        day: d.getDate(),
        month: d.getMonth() + 1,
        weekday: d.getDay(),
        year: d.getFullYear()
    };
    tasks.forEach(task => {
        const runTask = Object.entries(now).every(([key, value]) => {
            if (key === 'year') {
                return task.year === null || existsInArray(task.year, value);
            }
            return existsInArray((task as any)[key], value);
        });
        if (runTask) {
            console.info(`myCron: Running task ${task.name}`);
            // Run task asynchronously
            setTimeout(() => {
                try {
                    task.lastRun = new Date();
                    task.countRuns++;
                    const retVal = task.callBack() as any;
                    if (retVal instanceof Promise) {
                        retVal.catch(err => {
                            console.error(`myCron: Error executing task ${task.name}:`);
                            console.error(err);
                        });
                    }
                    if (task.maxRuns && task.countRuns === task.maxRuns) {
                        removeTask(task.name);
                    }
                } catch (err) {
                    console.error(`myCron: Error executing task ${task.name}:`);
                    console.error(err);
                }
            }, 5);
        }
    });
};

const myCron = {
    addTask,
    removeTask,
    tasks: getTasks
};

export default myCron;
