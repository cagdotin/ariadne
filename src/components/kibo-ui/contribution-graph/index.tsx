import type { Day as WeekDay } from "date-fns";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  formatISO,
  getDay,
  getMonth,
  getYear,
  nextDay,
  parseISO,
  subWeeks,
} from "date-fns";
import {
  type CSSProperties,
  createContext,
  Fragment,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import { cn } from "@/lib/utils";

export type Activity = {
  date: string;
  count: number;
  level: number;
};

type Week = Array<Activity | undefined>;

export type Labels = {
  months?: string[];
  weekdays?: string[];
  totalCount?: string;
  legend?: {
    less?: string;
    more?: string;
  };
};

type MonthLabel = {
  weekIndex: number;
  label: string;
};

const DEFAULT_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DEFAULT_LABELS: Labels = {
  months: DEFAULT_MONTH_LABELS,
  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  totalCount: "{{count}} activities in {{year}}",
  legend: {
    less: "Less",
    more: "More",
  },
};

type ContributionGraphContextType = {
  data: Activity[];
  weeks: Week[];
  blockMargin: number;
  blockRadius: number;
  blockSize: number;
  fontSize: number;
  labels: Labels;
  labelHeight: number;
  maxLevel: number;
  totalCount: number;
  weekStart: WeekDay;
  year: number;
  width: number;
  height: number;
};

const ContributionGraphContext =
  createContext<ContributionGraphContextType | null>(null);

const useContributionGraph = () => {
  const context = useContext(ContributionGraphContext);

  if (!context) {
    throw new Error(
      "ContributionGraph components must be used within a ContributionGraph"
    );
  }

  return context;
};

const fill_holes = (activities: Activity[]): Activity[] => {
  if (activities.length === 0) {
    return [];
  }

  // Sort activities by date to ensure correct date range
  const sorted_activities = [...activities].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const calendar = new Map<string, Activity>(
    activities.map((a) => [a.date, a])
  );

  const first_activity = sorted_activities[0] as Activity;
  const last_activity = sorted_activities[sorted_activities.length - 1];

  if (!last_activity) {
    return [];
  }

  return eachDayOfInterval({
    start: parseISO(first_activity.date),
    end: parseISO(last_activity.date),
  }).map((day) => {
    const date = formatISO(day, { representation: "date" });

    if (calendar.has(date)) {
      return calendar.get(date) as Activity;
    }

    return {
      date,
      count: 0,
      level: 0,
    };
  });
};

const group_by_weeks = (
  activities: Activity[],
  week_start: WeekDay = 0
): Week[] => {
  if (activities.length === 0) {
    return [];
  }

  const normalized_activities = fill_holes(activities);
  const first_activity = normalized_activities[0] as Activity;
  const first_date = parseISO(first_activity.date);
  const first_calendar_date =
    getDay(first_date) === week_start
      ? first_date
      : subWeeks(nextDay(first_date, week_start), 1);

  const padded_activities = [
    ...(new Array(differenceInCalendarDays(first_date, first_calendar_date)).fill(
      undefined
    ) as Activity[]),
    ...normalized_activities,
  ];

  const number_of_weeks = Math.ceil(padded_activities.length / 7);

  return new Array(number_of_weeks)
    .fill(undefined)
    .map((_, week_index) =>
      padded_activities.slice(week_index * 7, week_index * 7 + 7)
    );
};

const get_month_labels = (
  weeks: Week[],
  month_names: string[] = DEFAULT_MONTH_LABELS
): MonthLabel[] => {
  return weeks
    .reduce<MonthLabel[]>((labels, week, week_index) => {
      const first_activity = week.find((activity) => activity !== undefined);

      if (!first_activity) {
        throw new Error(
          `Unexpected error: Week ${week_index + 1} is empty: [${week}].`
        );
      }

      const month = month_names[getMonth(parseISO(first_activity.date))];

      if (!month) {
        const month_name = new Date(first_activity.date).toLocaleString("en-US", {
          month: "short",
        });
        throw new Error(
          `Unexpected error: undefined month label for ${month_name}.`
        );
      }

      const prev_label = labels[labels.length - 1];

      if (week_index === 0 || !prev_label || prev_label.label !== month) {
        return labels.concat({ weekIndex: week_index, label: month });
      }

      return labels;
    }, [])
    .filter(({ weekIndex }, index, labels) => {
      const min_weeks = 3;

      if (index === 0) {
        return labels[1] && labels[1].weekIndex - weekIndex >= min_weeks;
      }

      if (index === labels.length - 1) {
        return weeks.slice(weekIndex).length >= min_weeks;
      }

      return true;
    });
};

export type ContributionGraphProps = HTMLAttributes<HTMLDivElement> & {
  data: Activity[];
  blockMargin?: number;
  blockRadius?: number;
  blockSize?: number;
  fontSize?: number;
  labels?: Labels;
  maxLevel?: number;
  style?: CSSProperties;
  totalCount?: number;
  weekStart?: WeekDay;
  children: ReactNode;
  className?: string;
};

export const ContributionGraph = ({
  data,
  blockMargin = 4,
  blockRadius = 2,
  blockSize = 12,
  fontSize = 14,
  labels: labels_prop = undefined,
  maxLevel: max_level_prop = 4,
  style = {},
  totalCount: total_count_prop = undefined,
  weekStart: week_start = 0,
  className,
  ...props
}: ContributionGraphProps) => {
  const max_level = Math.max(1, max_level_prop);
  const weeks = useMemo(() => group_by_weeks(data, week_start), [data, week_start]);
  const LABEL_MARGIN = 8;

  const labels = { ...DEFAULT_LABELS, ...labels_prop };
  const label_height = fontSize + LABEL_MARGIN;

  const year =
    data.length > 0
      ? getYear(parseISO(data[0].date))
      : new Date().getFullYear();

  const total_count =
    typeof total_count_prop === "number"
      ? total_count_prop
      : data.reduce((sum, activity) => sum + activity.count, 0);

  const width = weeks.length * (blockSize + blockMargin) - blockMargin;
  const height = label_height + (blockSize + blockMargin) * 7 - blockMargin;

  if (data.length === 0) {
    return null;
  }

  return (
    <ContributionGraphContext.Provider
      value={{
        data,
        weeks,
        blockMargin,
        blockRadius,
        blockSize,
        fontSize,
        labels,
        labelHeight: label_height,
        maxLevel: max_level,
        totalCount: total_count,
        weekStart: week_start,
        year,
        width,
        height,
      }}
    >
      <div
        className={cn("flex w-full min-w-0 flex-col gap-2", className)}
        style={{ fontSize, ...style }}
        {...props}
      />
    </ContributionGraphContext.Provider>
  );
};

export type ContributionGraphBlockProps = HTMLAttributes<SVGRectElement> & {
  activity: Activity;
  dayIndex: number;
  weekIndex: number;
};

export const ContributionGraphBlock = ({
  activity,
  dayIndex,
  weekIndex,
  className,
  ...props
}: ContributionGraphBlockProps) => {
  const { blockSize, blockMargin, blockRadius, labelHeight, maxLevel } =
    useContributionGraph();

  if (activity.level < 0 || activity.level > maxLevel) {
    throw new RangeError(
      `Provided activity level ${activity.level} for ${activity.date} is out of range. It must be between 0 and ${maxLevel}.`
    );
  }

  return (
    <rect
      className={cn(
        'data-[level="0"]:fill-muted',
        'data-[level="1"]:fill-muted-foreground/20',
        'data-[level="2"]:fill-muted-foreground/40',
        'data-[level="3"]:fill-muted-foreground/60',
        'data-[level="4"]:fill-muted-foreground/80',
        className
      )}
      data-count={activity.count}
      data-date={activity.date}
      data-level={activity.level}
      height={blockSize}
      rx={blockRadius}
      ry={blockRadius}
      width={blockSize}
      x={(blockSize + blockMargin) * weekIndex}
      y={labelHeight + (blockSize + blockMargin) * dayIndex}
      {...props}
    />
  );
};

export type ContributionGraphCalendarProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  hideMonthLabels?: boolean;
  responsive?: boolean;
  className?: string;
  children: (props: {
    activity: Activity;
    dayIndex: number;
    weekIndex: number;
  }) => ReactNode;
};

export const ContributionGraphCalendar = ({
  hideMonthLabels = false,
  responsive = false,
  className,
  children,
  ...props
}: ContributionGraphCalendarProps) => {
  const { weeks, width, height, blockSize, blockMargin, labels } =
    useContributionGraph();

  const month_labels = useMemo(
    () => get_month_labels(weeks, labels.months),
    [weeks, labels.months]
  );

  return (
    <div
      className={cn(
        responsive
          ? "w-full"
          : "max-w-full overflow-x-auto overflow-y-hidden",
        className
      )}
      {...props}
    >
      <svg
        className="block overflow-visible"
        viewBox={`0 0 ${width} ${height}`}
        {...(responsive
          ? { width: "100%", style: { aspectRatio: `${width} / ${height}` } }
          : { width, height })}
      >
        <title>Contribution Graph</title>
        {!hideMonthLabels && (
          <g className="fill-current">
            {month_labels.map(({ label, weekIndex }) => (
              <text
                dominantBaseline="hanging"
                key={weekIndex}
                x={(blockSize + blockMargin) * weekIndex}
              >
                {label}
              </text>
            ))}
          </g>
        )}
        {weeks.map((week, week_index) =>
          week.map((activity, day_index) => {
            if (!activity) {
              return null;
            }

            return (
              <Fragment key={`${week_index}-${day_index}`}>
                {children({ activity, dayIndex: day_index, weekIndex: week_index })}
              </Fragment>
            );
          })
        )}
      </svg>
    </div>
  );
};

export type ContributionGraphFooterProps = HTMLAttributes<HTMLDivElement>;

export const ContributionGraphFooter = ({
  className,
  ...props
}: ContributionGraphFooterProps) => (
  <div
    className={cn(
      "flex flex-wrap gap-1 whitespace-nowrap sm:gap-x-4",
      className
    )}
    {...props}
  />
);

export type ContributionGraphTotalCountProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children?: (props: { totalCount: number; year: number }) => ReactNode;
};

export const ContributionGraphTotalCount = ({
  className,
  children,
  ...props
}: ContributionGraphTotalCountProps) => {
  const { totalCount, year, labels } = useContributionGraph();

  if (children) {
    return <>{children({ totalCount, year })}</>;
  }

  return (
    <div className={cn("text-muted-foreground", className)} {...props}>
      {labels.totalCount
        ? labels.totalCount
            .replace("{{count}}", String(totalCount))
            .replace("{{year}}", String(year))
        : `${totalCount} activities in ${year}`}
    </div>
  );
};

export type ContributionGraphLegendProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children?: (props: { level: number }) => ReactNode;
};

export const ContributionGraphLegend = ({
  className,
  children,
  ...props
}: ContributionGraphLegendProps) => {
  const { labels, maxLevel, blockSize, blockRadius } = useContributionGraph();

  return (
    <div
      className={cn("ml-auto flex items-center gap-[3px]", className)}
      {...props}
    >
      <span className="mr-1 text-muted-foreground">
        {labels.legend?.less || "Less"}
      </span>
      {new Array(maxLevel + 1).fill(undefined).map((_, level) =>
        children ? (
          <Fragment key={level}>{children({ level })}</Fragment>
        ) : (
          <svg height={blockSize} key={level} width={blockSize}>
            <title>{`${level} contributions`}</title>
            <rect
              className={cn(
                "stroke-[1px] stroke-border",
                'data-[level="0"]:fill-muted',
                'data-[level="1"]:fill-muted-foreground/20',
                'data-[level="2"]:fill-muted-foreground/40',
                'data-[level="3"]:fill-muted-foreground/60',
                'data-[level="4"]:fill-muted-foreground/80'
              )}
              data-level={level}
              height={blockSize}
              rx={blockRadius}
              ry={blockRadius}
              width={blockSize}
            />
          </svg>
        )
      )}
      <span className="ml-1 text-muted-foreground">
        {labels.legend?.more || "More"}
      </span>
    </div>
  );
};
